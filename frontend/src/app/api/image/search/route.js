import { NextResponse } from "next/server";

const SEARCH_API = "https://manager.foodsnap.in/api/image/search";

function extractResults(payload) {
    if (!payload) return [];

    return (
        payload.data ||
        payload.results ||
        payload.images ||
        payload.items ||
        (Array.isArray(payload) ? payload : [])
    );
}

const serverCache = new Map();
const SERVER_CACHE_TTL = 30 * 60 * 1000;
const MAX_SERVER_CACHE_SIZE = 500;

export async function GET(req) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const { searchParams } = new URL(req.url);

        const query = searchParams.get("q")?.trim();

        if (!query) {
            return NextResponse.json({
                success: true,
                data: [],
                query: "",
                page: 1,
                limit: 12,
                total: 0,
                hasMore: false,
                pagination: {
                    totalCount: 0,
                    currentPage: 1,
                    totalPages: 0,
                    limit: 12,
                },
            });
        }

        const page = Math.max(
            1,
            Number.parseInt(searchParams.get("page") ?? "1", 10),
        );

        const limit = Math.min(
            60,
            Math.max(1, Number.parseInt(searchParams.get("limit") ?? "12", 10)),
        );

        // Platform detection: defaults to swiggy
        const platform = searchParams.get("platform") ?? "swiggy";
        const premium = searchParams.get("premium");

        const cacheKey = `${query.toLowerCase()}_${page}_${limit}_${platform}_${premium}`;
        const cached = serverCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL) {
            return NextResponse.json(cached.body, {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
                    "X-Cache": "HIT"
                }
            });
        }

        const url = new URL(SEARCH_API);

        url.searchParams.set("q", query);
        url.searchParams.set("page", String(page));
        url.searchParams.set("limit", String(limit));
        // url.searchParams.set("latest", "true");

        // Only pass approved=true for Zomato, skip for Swiggy
        if (platform === "zomato") {
            url.searchParams.set("approved", "true");
        }

        // Forward premium parameter if provided
        if (premium === "true") {
            url.searchParams.set("premium", "true");
        }

        const response = await fetch(url.toString(), {
            signal: controller.signal,
            cache: "no-store",
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            console.error(
                `Search API failed: ${response.status} ${response.statusText}`,
            );

            return NextResponse.json(
                {
                    success: false,
                    message: "Search service unavailable",
                },
                {
                    status: response.status,
                },
            );
        }

        const payload = await response.json();
        const rawResults = extractResults(payload);
        const results = rawResults.map((item) => {
            const fullUrl = item.image_url || item.url || item.imageUrl || item.optimised_image_url;
            const rawThumb = item.optimised_image_url || item.thumb_url || item.thumbUrl || item.thumbnail || fullUrl;
            const fastThumb = rawThumb && rawThumb.startsWith("http")
                ? `/api/image/proxy?url=${encodeURIComponent(rawThumb)}&w=320&format=webp`
                : rawThumb;
            return {
                ...item,
                image_url: fullUrl,
                url: fullUrl,
                thumb_url: fastThumb,
                thumbUrl: fastThumb,
                fallback_thumb_url: rawThumb,
                optimised_image_url: item.optimised_image_url || rawThumb,
            };
        });

        const responseBody = {
            success: true,
            query: payload.query ?? query,
            data: results,
            page: payload.page ?? page,
            limit: payload.limit ?? limit,
            total: payload.total ?? results.length,
            hasMore: payload.hasMore ?? false,
            pagination: payload.pagination ?? {
                totalCount: payload.total ?? results.length,
                currentPage: payload.page ?? page,
                totalPages: Math.ceil(
                    (payload.total ?? results.length) / (payload.limit ?? limit),
                ),
                limit: payload.limit ?? limit,
            },
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
                    "X-Cache": "MISS"
                },
            },
        );
    } catch (error) {
        console.error("Search Route Error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.name === "AbortError"
                        ? "Search request timed out"
                        : "Failed to search images",
            },
            {
                status: error?.name === "AbortError" ? 504 : 500,
            },
        );
    } finally {
        clearTimeout(timeout);
    }
}
