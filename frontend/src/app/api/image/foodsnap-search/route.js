import { NextResponse } from "next/server";

const FOODSNAP_API = "https://admin-foodsnap.vercel.app/api/images/search";

export async function GET(req) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
        const { searchParams } = new URL(req.url);

        const query = searchParams.get("q")?.trim() || searchParams.get("query")?.trim() || "";
        const category = searchParams.get("category")?.trim() || "";
        const foodType = searchParams.get("food_type")?.trim() || "";
        const approved = searchParams.get("approved");
        const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
        const limit = Math.min(60, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "24", 10)));

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
        const results = payload.data || [];
        const total = payload.pagination?.total ?? results.length;
        const totalPages = payload.pagination?.totalPages ?? Math.ceil(total / limit);
        const hasMore = page < totalPages;

        return NextResponse.json(
            {
                success: true,
                data: results,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages,
                },
                hasMore,
            },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
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
