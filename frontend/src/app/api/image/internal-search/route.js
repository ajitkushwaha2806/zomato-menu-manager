import { NextResponse } from "next/server";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";

export async function GET(req) {
    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("q")?.trim();
        const exact = searchParams.get("exact") === "true";
        const limit = Math.min(
            60,
            Math.max(1, Number.parseInt(searchParams.get("limit") ?? "12", 10)),
        );

        if (!query) {
            return NextResponse.json({
                success: true,
                data: [],
            });
        }

        const cleanQuery = query
            .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, " ")
            .replace(/-\s*(serves|half|full|pcs|pieces|\d+).*/i, " ")
            .trim();

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const escapedCleanQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        let nameCondition;
        if (exact) {
            nameCondition = {
                $or: [
                    { "menu.sub_category.items.name": { $regex: `^${escapedQuery}$`, $options: "i" } },
                    ...(cleanQuery && cleanQuery !== query ? [{ "menu.sub_category.items.name": { $regex: `^${escapedCleanQuery}$`, $options: "i" } }] : [])
                ]
            };
        } else {
            const words = cleanQuery
                .replace(/[^a-zA-Z0-9\s]/g, " ")
                .trim()
                .split(/\s+/)
                .filter((w) => w.length >= 2)
                .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

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
                    restaurantName: { $first: "$restaurantName" },
                    platform: { $first: "$platform" },
                    category: { $first: "$category" },
                    mediaId: { $first: "$mediaId" },
                    thumbUrl: { $first: "$thumbUrl" }
                }
            },
            { $sort: { count: -1 } },
            { $limit: limit }
        ];

        const matchedItems = await Menu.aggregate(pipeline);

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
                thumb_url: item.thumbUrl || imgUrl,
                thumbUrl: item.thumbUrl || imgUrl,
                count: item.count || 1,
                mediaId: item.mediaId || null,
                category: item.category || "Internal DB",
                restaurantName: item.restaurantName || "",
                approved: true,
                premium: false,
                _source: "internal"
            };
        }).filter(img => img.image_url);

        return NextResponse.json({
            success: true,
            data: results,
            total: results.length,
        });

    } catch (error) {
        console.error("Internal Search Route Error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to search internal database" },
            { status: 500 }
        );
    }
}
