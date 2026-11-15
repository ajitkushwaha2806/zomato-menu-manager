import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import https from 'https';

function fetchUrlBuffer(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
            timeout: 15000,
        }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                return resolve(fetchUrlBuffer(res.headers.location, maxRedirects - 1));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP status ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    buffer: Buffer.concat(chunks),
                    contentType: res.headers['content-type'] || 'image/jpeg',
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

export async function GET(request, { params }) {
    try {
        const { resId } = await params;
        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');
        let accessToken = searchParams.get('accessToken');

        const authHeader = request.headers.get('authorization');
        if (!accessToken && authHeader && authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        }

        if (!fileId) {
            return new NextResponse('Missing fileId parameter', { status: 400 });
        }

        const isThumb = searchParams.get('thumb') === '1' || searchParams.get('thumb') === 'true';
        const convertTo = searchParams.get('format') || searchParams.get('convertTo');

        let buffer = null;
        let finalMimeType = 'image/jpeg';
        let fileName = 'drive-image.jpg';

        // 1. If thumbnail requested, try fast LH3 direct thumbnail
        if (isThumb) {
            try {
                const thumbRes = await fetchUrlBuffer(`https://lh3.googleusercontent.com/d/${fileId}=w300`);
                if (thumbRes && thumbRes.buffer && thumbRes.buffer.length > 0) {
                    return new NextResponse(thumbRes.buffer, {
                        status: 200,
                        headers: {
                            'Content-Type': thumbRes.contentType || 'image/jpeg',
                            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                        },
                    });
                }
            } catch (thumbErr) {
                console.warn('LH3 thumbnail fetch fallback:', thumbErr.message);
            }
        }

        // 2. Direct public export download (fastest, supports public folders without OAuth)
        try {
            const dlRes = await fetchUrlBuffer(`https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
            if (dlRes && dlRes.buffer && dlRes.buffer.length > 0) {
                buffer = dlRes.buffer;
                if (dlRes.contentType && dlRes.contentType.startsWith('image/')) {
                    finalMimeType = dlRes.contentType;
                }
            }
        } catch (pubDlErr) {
            // Fallback to uc?export
            try {
                const ucRes = await fetchUrlBuffer(`https://drive.google.com/uc?export=download&id=${fileId}`);
                if (ucRes && ucRes.buffer && ucRes.buffer.length > 0) {
                    buffer = ucRes.buffer;
                    if (ucRes.contentType && ucRes.contentType.startsWith('image/')) {
                        finalMimeType = ucRes.contentType;
                    }
                }
            } catch (ucErr) {}
        }

        // 3. Fallback: Authenticated Google Drive API (for private files)
        if (!buffer && accessToken) {
            try {
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: accessToken });
                const drive = google.drive({ version: 'v3', auth });

                try {
                    const meta = await drive.files.get({
                        fileId,
                        fields: 'id, name, mimeType, size',
                        supportsAllDrives: true,
                    });
                    if (meta?.data?.mimeType) finalMimeType = meta.data.mimeType;
                    if (meta?.data?.name) fileName = meta.data.name;
                } catch (metaErr) {}

                const fileRes = await drive.files.get(
                    { fileId, alt: 'media', supportsAllDrives: true },
                    { responseType: 'arraybuffer' }
                );
                buffer = Buffer.from(fileRes.data);
            } catch (oauthErr) {
                console.warn('OAuth file fetch failed:', oauthErr.message);
            }
        }

        if (!buffer) {
            return new NextResponse('Unable to download Drive file. Make sure link sharing is set to Anyone with the link can view.', { status: 404 });
        }

        // 4. Sharp format/size processing
        try {
            const sharp = require('sharp');
            let sharpInstance = sharp(buffer);

            if (isThumb) {
                sharpInstance = sharpInstance.resize(220, 220, {
                    fit: 'cover',
                    position: 'center',
                }).jpeg({ quality: 80 });
                buffer = await sharpInstance.toBuffer();
                finalMimeType = 'image/jpeg';
            } else if (
                convertTo === 'jpeg' ||
                convertTo === 'jpg' ||
                !finalMimeType.startsWith('image/') ||
                finalMimeType.includes('webp') ||
                finalMimeType.includes('avif') ||
                finalMimeType.includes('heic')
            ) {
                sharpInstance = sharpInstance.jpeg({ quality: 90 });
                buffer = await sharpInstance.toBuffer();
                finalMimeType = 'image/jpeg';
            }
        } catch (sharpErr) {
            console.warn('Sharp processing notice in drive-file:', sharpErr.message);
        }

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': finalMimeType,
                'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
        });
    } catch (error) {
        console.error('Drive file proxy error:', error);
        return new NextResponse(error.message || 'Internal server error while fetching Drive file.', { status: 500 });
    }
}
