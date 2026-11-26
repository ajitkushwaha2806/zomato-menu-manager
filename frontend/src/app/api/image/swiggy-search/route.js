import { NextResponse } from 'next/server';
import axios from 'axios';

const serverCache = new Map();
const SERVER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_SERVER_CACHE_SIZE = 500;

// Calculate how many words match between query and text
function scoreMatch(query, text) {
    if (!text) return 0;
    const queryTokens = query.toLowerCase().split(/\s+/);
    const textTokens = text.toLowerCase().split(/\s+/);
    let matchCount = 0;
    for (const token of queryTokens) {
        if (textTokens.some(t => t.includes(token) || token.includes(t))) {
            matchCount++;
        }
    }
    return matchCount;
}

// Recursively extract all valid image IDs and their associated text (like dish name)
function extractSwiggyImages(obj, resultsMap = new Map()) {
    if (!obj || typeof obj !== 'object') return resultsMap;
    
    // Look for contextual text (dish name or title)
    const contextText = obj.name || obj.title || obj.text || '';
    
    const addImage = (id) => {
        if (typeof id === 'string' && id.length > 10 && !id.includes('badge')) {
            if (!resultsMap.has(id)) {
                resultsMap.set(id, contextText);
            } else if (contextText.length > 0 && resultsMap.get(id) === '') {
                // Update with better context if we found one
                resultsMap.set(id, contextText);
            }
        }
    };

    if (obj.imageId) addImage(obj.imageId);
    if (obj.cloudinaryImageId) addImage(obj.cloudinaryImageId);
    
    Object.values(obj).forEach(val => extractSwiggyImages(val, resultsMap));
    return resultsMap;
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawQuery = searchParams.get('q')?.trim();
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(60, Math.max(1, parseInt(searchParams.get('limit') || '48', 10)));

        if (!rawQuery) {
            return NextResponse.json({ success: false, message: 'Query is required' }, { status: 400 });
        }

        const cacheKey = `swiggy_${rawQuery.toLowerCase()}_p${page}_l${limit}`;
        const cached = serverCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL) {
            return NextResponse.json(cached.body, {
                headers: {
                    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
                    'X-Cache': 'HIT',
                },
            });
        }

        const commonHeaders = {
            '__fetch_req__': 'true',
            'accept': '*/*',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'content-type': 'application/json',
            'platform': 'dweb',
            'priority': 'u=1, i',
            'referer': `https://www.swiggy.com/search?query=${encodeURIComponent(rawQuery)}`,
            'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
            'sec-ch-ua-platform': '"Android"',
            'sec-ch-ua-mobile': '?1',
            'Cookie': `_sid=si0dd8a68e7-400d-47db-9678-9eae145e2; tid=eyJLSUQiOiIyIiwiYWxnIjoiSFMyNTYiLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE3ODQxNDUwNzIsImlhdCI6MTc4NDE0MTQ3Miwic2Vzc2lvbl9kYXRhIjoielppd2Y4dDhNMXFvOUlabFpFMzkyekVxT1dxeTdWcEFvSmlTVG9BUGt0cXhFNzVPcDBBM1pOM3NjYm1wbDJZMmhFa2x6eWQ2ZVk5elpIN0NXOUNXMldLTlRmMVI0T2w4eHlVdXhVaGpTc1JSRXV1emRBL21HOFFPejFSQ0Y2OHVyNzBBNmlNdFBGWmhvWjBHb0hhUlQ3OEZDT2tKem1WY0RmM1dwUXZybGZvc0JtOVlRNktKN3loNjV4L2dZOWV4WHpnWFl4ZDFrSEtORXE5VjZheEoyQT09Iiwic2lkIjoic2kwZGQ4YTY4ZTctNDAwZC00N2RiLTk2NzgtOWVhZTE0NWUyIiwic3ViIjoiMTU0NGI5NzctNzNjMS00NzNmLTliODQtMGQ2ODkxYjgxOTFkIiwidXNlcl9pZCI6IjAifQ.dvEbF898ThwulqWpCFdKMsahhg8a9J8wU_Rf6DY7Q9w; _device_id=70c3a7e5-e79c-4f32-0a8d-318a59ec3db3;`,
            'csrf-token': 'q66wMlE3hRvc-NwDKVmdvZh17Y8S2YMpPbLhDD2o'
        };

        // Create a broadened query (e.g. drop the last word if it's long, or just grab the first 2 words)
        const tokens = rawQuery.split(' ');
        const broadenedQuery = tokens.length > 2 ? tokens.slice(0, 2).join(' ') : rawQuery + ' veg';

        // Hit Swiggy Search API twice in parallel (Raw Query + Broadened Query) with 5s timeout
        const searchUrl1 = `https://www.swiggy.com/dapi/restaurants/search/v3?lat=28.63270&lng=77.21980&str=${encodeURIComponent(rawQuery)}&trackingId=undefined&submitAction=ENTER&queryUniqueId=40b301fa-9bad-b301-f196-d9095b2398c4`;
        const searchUrl2 = `https://www.swiggy.com/dapi/restaurants/search/v3?lat=28.63270&lng=77.21980&str=${encodeURIComponent(broadenedQuery)}&trackingId=undefined&submitAction=ENTER&queryUniqueId=40b301fa-9bad-b301-f196-d9095b2398c4`;
        
        const [res1, res2] = await Promise.all([
            axios.get(searchUrl1, { headers: commonHeaders, timeout: 5000 }).catch(() => ({ data: {} })),
            axios.get(searchUrl2, { headers: commonHeaders, timeout: 5000 }).catch(() => ({ data: {} }))
        ]);

        // Extract image maps from both responses
        const map1 = extractSwiggyImages(res1.data);
        const map2 = extractSwiggyImages(res2.data);
        
        // Merge them
        const mergedMap = new Map([...map1, ...map2]);

        // Rank images based on how well their text matches the raw query
        const rankedImageIds = Array.from(mergedMap.entries()).sort((a, b) => {
            const scoreA = scoreMatch(rawQuery, a[1]);
            const scoreB = scoreMatch(rawQuery, b[1]);
            return scoreB - scoreA; // Descending order (highest match first)
        }).map(entry => entry[0]);
        
        // Paginate results in-memory
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedIds = rankedImageIds.slice(startIndex, endIndex);
        const hasMore = endIndex < rankedImageIds.length;
        
        // Use lightweight w_300 CDN thumbnail for instant sidebar loading, and w_1024 for full upload
        const swiggyThumbBaseUrl = 'https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_300/';
        const swiggyFullBaseUrl = 'https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_1024/';

        const formattedImages = paginatedIds.map((id, index) => {
            const title = mergedMap.get(id) ? `${mergedMap.get(id)} (Swiggy)` : `${rawQuery} (Swiggy)`;
            const thumbUrl = `${swiggyThumbBaseUrl}${id}`;
            const fullUrl = `${swiggyFullBaseUrl}${id}`;
            return {
                _id: `swiggy_${id}_${startIndex + index}`,
                id: `swiggy_${id}_${startIndex + index}`,
                thumb_url: thumbUrl,
                thumbUrl: thumbUrl,
                optimised_image_url: thumbUrl,
                image_url: fullUrl,
                url: fullUrl,
                title,
                category: 'Food Delivery'
            };
        });

        const responseBody = {
            success: true,
            data: formattedImages,
            hasMore: hasMore
        };

        if (serverCache.size >= MAX_SERVER_CACHE_SIZE) {
            const oldestKey = serverCache.keys().next().value;
            if (oldestKey) serverCache.delete(oldestKey);
        }
        serverCache.set(cacheKey, { body: responseBody, timestamp: Date.now() });

        return NextResponse.json(responseBody, {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
                'X-Cache': 'MISS',
            },
        });
    } catch (error) {
        console.error('Swiggy Search API Error:', error);
        return NextResponse.json({ 
            success: false, 
            message: 'Failed to search images',
            error: error.message 
        }, { status: 500 });
    }
}
