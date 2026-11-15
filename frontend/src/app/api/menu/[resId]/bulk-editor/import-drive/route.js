import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import https from 'https';

function parseFolderInfo(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return { folderId: null, resourceKey: null };
    const trimmed = urlOrId.trim();
    if (!trimmed) return { folderId: null, resourceKey: null };

    let folderId = null;
    let resourceKey = null;

    // Extract resourceKey if present
    const rkMatch = trimmed.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/i);
    if (rkMatch && rkMatch[1]) resourceKey = rkMatch[1];

    // Pattern 1: .../folders/<folderId>...
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) folderId = folderMatch[1];

    // Pattern 2: ...?id=<folderId>...
    if (!folderId) {
        const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) folderId = idMatch[1];
    }

    // Pattern 3: direct ID string (typically 25+ chars, letters, digits, hyphen, underscore)
    if (!folderId && !trimmed.includes('/') && !trimmed.includes('.')) {
        folderId = trimmed;
    }

    // Pattern 4: last path segment
    if (!folderId) {
        const clean = trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '');
        const lastSeg = clean.split('/').pop();
        if (lastSeg && lastSeg.length >= 20 && !lastSeg.includes('.')) {
            folderId = lastSeg;
        }
    }

    return { folderId, resourceKey };
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'svg', 'heic']);

function isImageFile(name, mimeType) {
    if (mimeType && mimeType.startsWith('image/')) return true;
    const ext = (name || '').split('.').pop()?.toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
}

// Fetch public drive folder files without requiring Google OAuth or API keys
async function fetchPublicDriveFolder(folderId) {
    return new Promise((resolve) => {
        const url = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const files = [];
                const seenIds = new Set();

                // Look for embedded window['_DRIVE_ivd'] payload
                const ivdMatch = data.match(/window\[.(_DRIVE_ivd).\]\s*=\s*.([^'\'']+)./);
                if (ivdMatch && ivdMatch[2]) {
                    try {
                        const raw = ivdMatch[2];
                        const unescaped = raw.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                        const parsed = JSON.parse(unescaped);
                        const items = Array.isArray(parsed) ? (Array.isArray(parsed[0]) ? parsed[0] : parsed) : [];
                        for (const item of items) {
                            if (Array.isArray(item)) {
                                const id = typeof item[0] === 'string' ? item[0] : null;
                                const name = typeof item[2] === 'string' ? item[2] : null;
                                const mimeType = typeof item[3] === 'string' ? item[3] : 'image/jpeg';
                                const size = item[13] || null;

                                if (id && name && !seenIds.has(id) && isImageFile(name, mimeType)) {
                                    seenIds.add(id);
                                    files.push({
                                        id,
                                        name,
                                        mimeType,
                                        size,
                                        thumbnailLink: `https://lh3.googleusercontent.com/d/${id}=w300`,
                                        webViewLink: `https://drive.google.com/file/d/${id}/view`,
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.warn('IVD parsing notice:', err.message);
                    }
                }

                // Fallback: regex for file objects in script tags
                if (files.length === 0) {
                    const regex = /\[\"([a-zA-Z0-9_-]{25,})\",\[\"[^\"]*\"\],\"([^\"]+\.(jpg|jpeg|png|webp|avif|gif))\"/gi;
                    let match;
                    while ((match = regex.exec(data)) !== null) {
                        const id = match[1];
                        const name = match[2];
                        if (!seenIds.has(id)) {
                            seenIds.add(id);
                            files.push({
                                id,
                                name,
                                mimeType: 'image/jpeg',
                                thumbnailLink: `https://lh3.googleusercontent.com/d/${id}=w300`,
                                webViewLink: `https://drive.google.com/file/d/${id}/view`,
                            });
                        }
                    }
                }

                resolve(files);
            });
        });

        req.on('error', (err) => {
            console.warn('Public drive folder fetch error:', err.message);
            resolve([]);
        });
        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
}

export async function POST(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();
        const { accessToken, folderUrl, includeSubfolders = true, searchQuery = '' } = body;

        const { folderId, resourceKey } = parseFolderInfo(folderUrl);

        let imageFiles = [];
        const maxFilesLimit = 600;

        // 1. If folderId is present, try fast public Drive scraping first
        if (folderId) {
            try {
                const publicFiles = await fetchPublicDriveFolder(folderId);
                if (publicFiles.length > 0) {
                    imageFiles.push(...publicFiles);
                }
            } catch (pubErr) {
                console.warn('Public drive scrape attempt failed:', pubErr.message);
            }
        }

        // 2. If folder was public and yielded files, return them immediately!
        if (imageFiles.length > 0) {
            return NextResponse.json({
                success: true,
                files: imageFiles,
                folderId: folderId || null,
                totalFound: imageFiles.length,
                source: 'public_drive',
            });
        }

        // 3. Fallback to authenticated Google Drive API (for private folders or searching entire user Drive)
        if (accessToken) {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth });

            const requestHeaders = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${folderId}/${resourceKey}` } : {};

            if (folderId) {
                const foldersQueue = [folderId];
                const scannedFolderIds = new Set();
                let folderScanCount = 0;
                const maxFolderScans = 25;

                while (foldersQueue.length > 0 && folderScanCount < maxFolderScans && imageFiles.length < maxFilesLimit) {
                    const currentFolderId = foldersQueue.shift();
                    if (scannedFolderIds.has(currentFolderId)) continue;
                    scannedFolderIds.add(currentFolderId);
                    folderScanCount++;

                    let pageToken = null;
                    do {
                        const query = `'${currentFolderId}' in parents and trashed = false`;
                        const res = await drive.files.list({
                            q: query,
                            fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, parents, createdTime)',
                            pageSize: 100,
                            pageToken: pageToken,
                            supportsAllDrives: true,
                            includeItemsFromAllDrives: true,
                            headers: requestHeaders,
                        });

                        const files = res.data.files || [];
                        for (const file of files) {
                            if (file.mimeType === 'application/vnd.google-apps.folder') {
                                if (includeSubfolders && !scannedFolderIds.has(file.id)) {
                                    foldersQueue.push(file.id);
                                }
                            } else if (isImageFile(file.name, file.mimeType)) {
                                imageFiles.push({
                                    id: file.id,
                                    name: file.name,
                                    mimeType: file.mimeType,
                                    size: file.size,
                                    thumbnailLink: file.thumbnailLink || `https://lh3.googleusercontent.com/d/${file.id}=w300`,
                                    webViewLink: file.webViewLink,
                                    parents: file.parents,
                                    createdTime: file.createdTime,
                                });
                                if (imageFiles.length >= maxFilesLimit) break;
                            }
                        }

                        pageToken = res.data.nextPageToken;
                    } while (pageToken && imageFiles.length < maxFilesLimit);
                }
            } else {
                // No folder: search user's recent images in personal Drive
                let pageToken = null;
                let query = 'trashed = false and mimeType contains "image/"';
                if (searchQuery && searchQuery.trim()) {
                    const cleanQuery = searchQuery.trim().replace(/['\\]/g, '');
                    query += ` and name contains '${cleanQuery}'`;
                }

                do {
                    const res = await drive.files.list({
                        q: query,
                        orderBy: 'modifiedTime desc',
                        fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, parents, createdTime)',
                        pageSize: 100,
                        pageToken: pageToken,
                        supportsAllDrives: true,
                        includeItemsFromAllDrives: true,
                    });

                    const files = res.data.files || [];
                    for (const file of files) {
                        if (isImageFile(file.name, file.mimeType)) {
                            imageFiles.push({
                                id: file.id,
                                name: file.name,
                                mimeType: file.mimeType,
                                size: file.size,
                                thumbnailLink: file.thumbnailLink || `https://lh3.googleusercontent.com/d/${file.id}=w300`,
                                webViewLink: file.webViewLink,
                                parents: file.parents,
                                createdTime: file.createdTime,
                            });
                            if (imageFiles.length >= maxFilesLimit) break;
                        }
                    }

                    pageToken = res.data.nextPageToken;
                } while (pageToken && imageFiles.length < 300);
            }
        }

        return NextResponse.json({
            success: true,
            files: imageFiles,
            folderId: folderId || null,
            totalFound: imageFiles.length,
        });
    } catch (error) {
        console.error('Import Drive API search error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Internal server error while searching Google Drive.' },
            { status: 500 }
        );
    }
}
