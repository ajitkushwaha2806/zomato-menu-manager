import { NextResponse } from "next/server";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";

const serverCache = new Map();
const SERVER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_SERVER_CACHE_SIZE = 300;

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q")?.trim();
        const exact = searchParams.get("exact") === "true";
        const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10));
        const limit = Math.min(
            60,
            Math.max(1, Number.parseInt(searchParams.get("limit") ?? "24", 10)),
        );
        const skip = (page - 1) * limit;

        if (!query) {
            return NextResponse.json({
                success: true,
                data: [],
                hasMore: false,
            });
        }

        const resIdsParam = searchParams.get("resIds");
        const cacheKey = `internal_${query.toLowerCase()}_${resIdsParam || 'all'}_${exact}_p${page}_l${limit}`;
        const cached = serverCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL) {
            return NextResponse.json(cached.body, {
                headers: {
                    "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
                    "X-Cache": "HIT",
                },
            });
        }

        await dbConnect();
        let resIds = [];
        if (resIdsParam) {
            resIds = resIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
        }

        const cleanQuery = query
            .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, " ")
            .replace(/-\s*(serves|half|full|pcs|pieces|\d+).*/i, " ")
            .trim();

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedCleanQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const words = cleanQuery
            .replace(/[^a-zA-Z0-9\s]/g, " ")
            .trim()
            .split(/\s+/)
            .filter((w) => w.length >= 2)
            .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

        let nameCondition;
        if (exact) {
            nameCondition = {
                $or: [
                    { "menu.sub_category.items.name": { $regex: `^${escapedQuery}$`, $options: "i" } },
                    ...(cleanQuery && cleanQuery !== query ? [{ "menu.sub_category.items.name": { $regex: `^${escapedCleanQuery}$`, $options: "i" } }] : [])
                ]
            };
        } else {
            const orClauses = [
                { "menu.sub_category.items.name": { $regex: escapedQuery, $options: "i" } }
            ];
            if (escapedCleanQuery && escapedCleanQuery !== escapedQuery) {
                orClauses.push({ "menu.sub_category.items.name": { $regex: escapedCleanQuery, $options: "i" } });
            }
            if (words.length > 1) {
                orClauses.push({
                    $and: words.map((w) => ({ "menu.sub_category.items.name": { $regex: w, $options: "i" } }))
                });
                words.forEach((w) => {
                    if (w.length >= 3) {
                        orClauses.push({ "menu.sub_category.items.name": { $regex: w, $options: "i" } });
                    }
                });
            }

            nameCondition = { $or: orClauses };
        }

        const matchStage = {
            $and: [
                nameCondition,
                {
                    $or: [
                        { "menu.sub_category.items.image_url": { $type: "string", $ne: "" } },
                        { "menu.sub_category.items.image": { $type: "string", $ne: "" } },
                        { "menu.sub_category.items.media.0": { $exists: true } }
                    ]
                }
            ]
        };

        if (resIds.length > 0) {
            matchStage.$and.push({ resId: { $in: resIds } });
        }

        const pipeline = [
            { $match: matchStage },
            { $unwind: "$menu" },
            { $unwind: { path: "$menu.sub_category", preserveNullAndEmptyArrays: false } },
            { $unwind: { path: "$menu.sub_category.items", preserveNullAndEmptyArrays: false } },
            { $match: matchStage },
            {
                $project: {
                    id: "$menu.sub_category.items.id",
                    name: "$menu.sub_category.items.name",
                    is_veg: "$menu.sub_category.items.is_veg",
                    resId: "$resId",
                    restaurantName: "$name",
                    platform: "$platform",
                    category: "$menu.name",
                    mediaId: {
                        $cond: {
                            if: { $and: [ { $isArray: "$menu.sub_category.items.media" }, { $gt: [{ $size: "$menu.sub_category.items.media" }, 0] } ] },
                            then: { $let: { vars: { firstMedia: { $arrayElemAt: ["$menu.sub_category.items.media", 0] } }, in: { $ifNull: ["$$firstMedia.mediaId", "$$firstMedia.id"] } } },
                            else: null
                        }
                    },
                    imageUrl: {
                        $cond: {
                            if: { $and: [ { $isArray: "$menu.sub_category.items.media" }, { $gt: [{ $size: "$menu.sub_category.items.media" }, 0] } ] },
                            then: { 
                                $let: { 
                                    vars: { firstMedia: { $arrayElemAt: ["$menu.sub_category.items.media", 0] } }, 
                                    in: { 
                                        $ifNull: [
                                            "$$firstMedia.url", 
                                            { $ifNull: [
                                                "$$firstMedia.imageUrl", 
                                                { $ifNull: [
                                                    "$$firstMedia.thumbUrl", 
                                                    { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                                                ]}
                                            ]}
                                        ] 
                                    } 
                                } 
                            },
                            else: { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                        }
                    },
                    thumbUrl: {
                        $cond: {
                            if: { $and: [ { $isArray: "$menu.sub_category.items.media" }, { $gt: [{ $size: "$menu.sub_category.items.media" }, 0] } ] },
                            then: { 
                                $let: { 
                                    vars: { firstMedia: { $arrayElemAt: ["$menu.sub_category.items.media", 0] } }, 
                                    in: { 
                                        $ifNull: [
                                            "$$firstMedia.thumbUrl", 
                                            { $ifNull: [
                                                "$$firstMedia.url", 
                                                { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                                            ]}
                                        ] 
                                    } 
                                } 
                            },
                            else: { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                        }
                    }
                }
            },
            {
                $match: {
                    imageUrl: { $type: "string", $regex: "^https?://" }
                }
            },
            {
                $group: {
                    _id: "$imageUrl",
                    count: { $sum: 1 },
                    id: { $first: "$id" },
                    name: { $first: "$name" },
                    allNames: { $addToSet: "$name" },
                    allVegStatuses: { $addToSet: "$is_veg" },
                    is_veg: { $first: "$is_veg" },
                    resId: { $first: "$resId" },
                    restaurantName: { $first: "$restaurantName" },
                    platform: { $first: "$platform" },
                    category: { $first: "$category" },
                    mediaId: { $first: "$mediaId" },
                    thumbUrl: { $first: "$thumbUrl" }
                }
            },
            { $sort: { count: -1 } },
            { $skip: skip },
            { $limit: limit + 1 }
        ];

        const rawMatchedItems = await Menu.aggregate(pipeline);
        const hasMore = rawMatchedItems.length > limit;
        const matchedItems = hasMore ? rawMatchedItems.slice(0, limit) : rawMatchedItems;

        // Map to standard format matching the manager.foodsnap.in API
        const targetQueryLower = query.toLowerCase().trim();
        const cleanQueryLower = cleanQuery.toLowerCase().trim();

        const results = matchedItems.map(item => {
            let bestTitle = item.name;
            if (Array.isArray(item.allNames) && item.allNames.length > 0) {
                const exactMatch = item.allNames.find(n => n && n.toLowerCase().trim() === targetQueryLower);
                if (exactMatch) {
                    bestTitle = exactMatch;
                } else {
                    const cleanExactMatch = item.allNames.find(n => n && n.toLowerCase().trim() === cleanQueryLower);
                    if (cleanExactMatch) {
                        bestTitle = cleanExactMatch;
                    }
                }
            }

            const isVeg = item.allVegStatuses?.includes("VEG") && !item.allVegStatuses?.includes("NON_VEG")
                ? "VEG"
                : (item.is_veg || "VEG");

            const imgUrl = item._id;
            const rawThumb = item.thumbUrl || imgUrl;
            let fastThumb = rawThumb;
            if (rawThumb && rawThumb.includes("b.zmtcdn.com/") && !rawThumb.includes("fit=")) {
                fastThumb = `${rawThumb}${rawThumb.includes("?") ? "&" : "?"}fit=around|300:300&crop=300:300;*,*`;
            } else if (rawThumb && rawThumb.includes("media-assets.swiggy.com/swiggy/image/upload/")) {
                fastThumb = rawThumb.replace(/\/swiggy\/image\/upload\/([^/]+\/)?/, "/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_300/");
            } else if (rawThumb && rawThumb.startsWith("http")) {
                fastThumb = `/api/image/proxy?url=${encodeURIComponent(rawThumb)}&w=320&format=webp`;
            }

            return {
                _id: item.id || imgUrl,
                title: bestTitle,
                name: bestTitle,
                dish_name: bestTitle,
                allNames: item.allNames || [bestTitle],
                is_veg: isVeg,
                food_type: isVeg === "VEG" ? "veg" : (isVeg === "EGG" ? "egg" : "non_veg"),
                image_url: imgUrl,
                url: imgUrl,
                thumb_url: fastThumb,
                thumbUrl: fastThumb,
                fallback_thumb_url: rawThumb,
                count: item.count || 1,
                mediaId: item.mediaId || null,
                category: item.category || "Outlet DB",
                resId: item.resId || "",
                restaurantName: item.restaurantName || item.resId || "",
                approved: true,
                premium: false,
                _source: "outlet"
            };
        }).filter(img => img.image_url);

        // Score results so the closest match appears first
        const wordsLower = (words || []).map(w => w.toLowerCase());
        const scoredResults = results.map(item => {
            const titleLower = (item.title || "").toLowerCase().trim();
            let score = 0;
            if (titleLower === targetQueryLower || titleLower === cleanQueryLower) {
                score = 100;
            } else if (titleLower.includes(targetQueryLower) || targetQueryLower.includes(titleLower)) {
                score = 80;
            } else {
                const itemWords = titleLower.split(/\s+/);
                let matchedWords = 0;
                wordsLower.forEach(w => {
                    if (itemWords.some(iw => iw.includes(w) || w.includes(iw))) {
                        matchedWords++;
                    }
                });
                score = (matchedWords / Math.max(1, wordsLower.length)) * 70;
            }
            return { ...item, _matchScore: score };
        });

        scoredResults.sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));

        const responseBody = {
            success: true,
            data: scoredResults,
            total: scoredResults.length,
            hasMore,
        };

        if (serverCache.size >= MAX_SERVER_CACHE_SIZE) {
            const oldestKey = serverCache.keys().next().value;
            if (oldestKey) serverCache.delete(oldestKey);
        }
        serverCache.set(cacheKey, { body: responseBody, timestamp: Date.now() });

        return NextResponse.json(responseBody, {
            headers: {
                "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
                "X-Cache": "MISS",
            },
        });

    } catch (error) {
        console.error("Internal Search Route Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to search internal database" },
            { status: 500 }
        );
    }
}
