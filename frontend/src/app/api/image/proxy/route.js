import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const imageUrl = searchParams.get('url');

        if (!imageUrl) {
            return new NextResponse('Missing url parameter', { status: 400 });
        }

        const parsed = new URL(imageUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return new NextResponse('Invalid protocol', { status: 400 });
        }

        const res = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });

        if (!res.ok) {
            return new NextResponse(`Failed to fetch image: ${res.statusText}`, { status: res.status });
        }

        let contentType = res.headers.get('content-type') || 'image/jpeg';
        let buffer = Buffer.from(await res.arrayBuffer());

        const format = searchParams.get('format') || searchParams.get('convertTo');
        if (format === 'jpeg' || format === 'jpg') {
            try {
                const sharp = require('sharp');
                buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
                contentType = 'image/jpeg';
            } catch (sharpError) {
                console.warn('Proxy Sharp conversion to JPEG failed:', sharpError.message);
            }
        }

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
        });
    } catch (error) {
        console.error('Image proxy error:', error);
        return new NextResponse(error.message || 'Internal server error', { status: 500 });
    }
}
