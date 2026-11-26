import { NextResponse } from "next/server";

const FOODSNAP_API = "https://admin-foodsnap.vercel.app/api/images/search";

const serverCache = new Map();
const SERVER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_SERVER_CACHE_SIZE = 500;

export async function GET(req) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const { searchParams } = new URL(req.url);

        const query = searchParams.get("q")?.trim() || searchParams.get("query")?.trim() || "";
        const category = searchParams.get("category")?.trim() || "";
        const foodType = searchParams.get("food_type")?.trim() || "";
        const approved = searchParams.get("approved");
        const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
        const limit = Math.min(60, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "24", 10)));

        const cacheKey = `fs_${query.toLowerCase()}_p${page}_l${limit}_c${category}_f${foodType}_a${approved}`;
        const cached = serverCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL) {
            return NextResponse.json(cached.body, {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
                    "X-Cache": "HIT",
                },
            });
        }

        const url = new URL(FOODSNAP_API);

        if (query) {
            url.searchParams.set("search", query);
        }
        if (category && category !== "all") {
            url.searchParams.set("category", category);
        }
        if (foodType && foodType !== "all") {
            url.searchParams.set("food_type", foodType);
        }
        if (approved === "true" || approved === "false") {
            url.searchParams.set("approved", approved);
        }

        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(limit));

        const response = await fetch(url.toString(), {
            signal: controller.signal,
            cache: "no-store",
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            console.error(`Foodsnap API error: ${response.status} ${response.statusText}`);
            return NextResponse.json(
                {
                    success: false,
                    message: `Foodsnap API responded with status ${response.status}`,
                },
                { status: response.status }
            );
        }

        const payload = await response.json();
        const rawResults = payload.data || [];
        const total = payload.pagination?.total ?? rawResults.length;
        const totalPages = payload.pagination?.totalPages ?? Math.ceil(total / limit);
        const hasMore = page < totalPages;

        // Normalize each item so high-res image and fast 320px WebP thumbnails are cleanly available
        const results = rawResults.map((item) => {
            const fullUrl = item.image_url || item.url || item.optimised_image_url;
            const rawThumb = item.optimised_image_url || item.thumbUrl || item.thumb_url || item.image_url;
            const fastThumb = rawThumb && rawThumb.startsWith("http")
                ? `/api/image/proxy?url=${encodeURIComponent(rawThumb)}&w=320&format=webp`
                : rawThumb;
            return {
                ...item,
                title: item.title || item.name || "",
                image_url: fullUrl,
                url: fullUrl,
                optimised_image_url: item.optimised_image_url || fullUrl,
                thumb_url: fastThumb,
                thumbUrl: fastThumb,
                fallback_thumb_url: rawThumb,
            };
        });

        const responseBody = {
            success: true,
            data: results,
            pagination: {
                total,
                page,
                limit,
                totalPages,
            },
            hasMore,
        };

        if (serverCache.size >= MAX_SERVER_CACHE_SIZE) {
            const oldestKey = serverCache.keys().next().value;
            if (oldestKey) serverCache.delete(oldestKey);
        }
        serverCache.set(cacheKey, { body: responseBody, timestamp: Date.now() });

        return NextResponse.json(
            responseBody,
            {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
                    "X-Cache": "MISS",
                },
            }
        );
    } catch (error) {
        console.error("Foodsnap Search Route Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.name === "AbortError" ? "Request timed out" : "Failed to search Foodsnap images",
            },
            { status: error?.name === "AbortError" ? 504 : 500 }
        );
    } finally {
        clearTimeout(timeout);
    }
}
