import { NextResponse } from 'next/server';
import sharp from 'sharp';

const thumbCache = new Map();
const MAX_THUMB_CACHE = 400;
const THUMB_TTL_MS = 30 * 60 * 1000;
const inFlightRequests = new Map();

function setCache(key, value) {
    if (thumbCache.size >= MAX_THUMB_CACHE) {
        const oldestKey = thumbCache.keys().next().value;
        if (oldestKey) thumbCache.delete(oldestKey);
    }
    thumbCache.set(key, { ...value, timestamp: Date.now() });
}

async function fetchAndProcessImage(imageUrl, width, format) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(imageUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });

        if (!res.ok) {
            return { errorStatus: res.status, errorText: res.statusText };
        }

        let contentType = res.headers.get('content-type') || 'image/jpeg';
        let buffer = Buffer.from(await res.arrayBuffer());

        const shouldResize = width && Number.isFinite(width) && width >= 64 && width <= 1200;
        const normalizedFormat = format?.toLowerCase();

        if (shouldResize || normalizedFormat === 'webp' || normalizedFormat === 'jpeg' || normalizedFormat === 'jpg') {
            try {
                let pipeline = sharp(buffer);
                if (shouldResize) {
                    pipeline = pipeline.resize(width, width, {
                        fit: 'cover',
                        withoutEnlargement: true,
                    });
                }
                if (normalizedFormat === 'webp') {
                    buffer = await pipeline.webp({ quality: 76 }).toBuffer();
                    contentType = 'image/webp';
                } else if (normalizedFormat === 'jpeg' || normalizedFormat === 'jpg') {
                    buffer = await pipeline.jpeg({ quality: 86 }).toBuffer();
                    contentType = 'image/jpeg';
                } else if (shouldResize) {
                    buffer = await pipeline.webp({ quality: 76 }).toBuffer();
                    contentType = 'image/webp';
                }
            } catch (sharpError) {
                console.warn('Proxy Sharp processing failed, returning original:', sharpError.message);
            }
        }

        return { buffer, contentType };
    } finally {
        clearTimeout(timeout);
    }
}

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

        const widthParam = searchParams.get('w');
        const width = widthParam ? Number.parseInt(widthParam, 10) : null;
        const format = searchParams.get('format') || searchParams.get('convertTo') || '';
        const cacheKey = `${imageUrl}__w=${width || 'orig'}__f=${format || 'orig'}`;

        // Only cache resized/optimized thumbnails in RAM to keep memory footprint small (~5-8MB)
        const isCacheable = Boolean(width && width <= 600);
        if (isCacheable) {
            const cached = thumbCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < THUMB_TTL_MS) {
                return new NextResponse(cached.buffer, {
                    status: 200,
                    headers: {
                        'Content-Type': cached.contentType,
                        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                        'X-Proxy-Cache': 'HIT',
                    },
                });
            }
        }

        let promise = inFlightRequests.get(cacheKey);
        if (!promise) {
            promise = fetchAndProcessImage(imageUrl, width, format).finally(() => {
                inFlightRequests.delete(cacheKey);
            });
            inFlightRequests.set(cacheKey, promise);
        }

        const result = await promise;

        if (result.errorStatus) {
            return new NextResponse(`Failed to fetch image: ${result.errorText}`, { status: result.errorStatus });
        }

        if (isCacheable && result.buffer && result.buffer.length < 300 * 1024) {
            setCache(cacheKey, { buffer: result.buffer, contentType: result.contentType });
        }

        return new NextResponse(result.buffer, {
            status: 200,
            headers: {
                'Content-Type': result.contentType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
                'X-Proxy-Cache': 'MISS',
            },
        });
    } catch (error) {
        console.error('Image proxy error:', error);
        return new NextResponse(error.message || 'Internal server error', {
            status: error?.name === 'AbortError' ? 504 : 500,
        });
    }
}
