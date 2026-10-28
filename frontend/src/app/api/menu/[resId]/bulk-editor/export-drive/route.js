import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();
        const { items, accessToken, convertToJpeg = true } = body;

        if (!items || !items.length) {
            return NextResponse.json({ success: false, message: 'No items provided for export.' }, { status: 400 });
        }

        if (!accessToken) {
            return NextResponse.json({ success: false, message: 'Google Drive access token is missing.' }, { status: 401 });
        }

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });

        const drive = google.drive({ version: 'v3', auth });

        let parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
        if (parentFolderId && parentFolderId.includes('http')) {
            parentFolderId = parentFolderId.split('/').pop().split('?')[0];
        }

        // Create a root folder for the export
        const folderName = `Menu Export - Res ID: ${resId} - ${new Date().toISOString().split('T')[0]}`;
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentFolderId && { parents: [parentFolderId] })
        };

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id, webViewLink'
        });

        const folderId = folder.data.id;
        const folderLink = folder.data.webViewLink;

        // Make the folder publicly accessible (anyone with the link can view)
        // If the user's workspace allows sharing externally.
        try {
            await drive.permissions.create({
                fileId: folderId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone',
                }
            });
        } catch (permError) {
            console.warn("Could not set public permissions (might be restricted by Workspace admins):", permError.message);
        }

        // Helper function to fetch an image and return a stream & extension
        const fetchImageStream = async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);
            let ext = url.split('.').pop().split('?')[0]?.toLowerCase() || 'jpg';
            let mimeType = response.headers.get('content-type') || 'image/jpeg';

            if (convertToJpeg) {
                try {
                    const sharp = require('sharp');
                    buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
                    ext = 'jpg';
                    mimeType = 'image/jpeg';
                } catch (sharpErr) {
                    console.warn("Sharp conversion to JPEG failed:", sharpErr.message);
                }
            }

            return {
                stream: Readable.from(buffer),
                ext,
                mimeType
            };
        };

        const titleCounts = {};

        // Pre-compute names synchronously to handle duplicates correctly
        items.forEach(item => {
            if (!item.url) return;
            let baseName = item.name ? item.name.replace(/[^a-z0-9 \-]/gi, '').trim() : 'Untitled';
            if (!baseName) baseName = 'Untitled';

            if (titleCounts[baseName] === undefined) {
                titleCounts[baseName] = 0;
                item.exportName = baseName;
            } else {
                titleCounts[baseName]++;
                item.exportName = `${baseName}-${titleCounts[baseName]}`;
            }
        });

        const uploadPromises = items.map(async (item) => {
            try {
                if (!item.url) return null;
                
                const { stream, ext, mimeType } = await fetchImageStream(item.url);
                const safeName = `${item.exportName}.${ext}`;

                const fileMetadata = {
                    name: safeName,
                    parents: [folderId]
                };
                const media = {
                    mimeType: mimeType || 'image/jpeg',
                    body: stream
                };

                await drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id'
                });
                return true;
            } catch (error) {
                console.error(`Failed to upload item ${item.id}:`, error);
                return false;
            }
        });

        await Promise.all(uploadPromises);

        return NextResponse.json({
            success: true,
            link: folderLink,
            folderId: folderId
        });
    } catch (error) {
        console.error('Export to Drive API error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
