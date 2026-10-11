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

        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        let nameQuery;
        if (exact) {
            nameQuery = { $regex: `^${escapedQuery}$`, $options: "i" };
        } else {
            const words = query
                .replace(/[^a-zA-Z0-9\s]/g, " ")
                .trim()
                .split(/\s+/)
                .filter((w) => w.length >= 3)
                .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

            if (words.length > 1) {
                nameQuery = {
                    $or: [
                        { $regex: escapedQuery, $options: "i" },
                        { $and: words.map((w) => ({ $regex: w, $options: "i" })) }
                    ]
                };
            } else {
                nameQuery = { $regex: escapedQuery, $options: "i" };
            }
        }

        const pipeline = [
            { $unwind: "$menu" },
            { $unwind: { path: "$menu.sub_category", preserveNullAndEmptyArrays: false } },
            { $unwind: { path: "$menu.sub_category.items", preserveNullAndEmptyArrays: false } },
            { 
                $match: { 
                    "menu.sub_category.items.name": nameQuery,
                    $or: [
                        { "menu.sub_category.items.image_url": { $type: "string", $ne: "" } },
                        { "menu.sub_category.items.image": { $type: "string", $ne: "" } },
                        { "menu.sub_category.items.media": { $type: "array", $ne: [] } }
                    ]
                } 
            },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    id: "$menu.sub_category.items.id",
                    name: "$menu.sub_category.items.name",
                    image_url: {
                        $cond: {
                            if: { $and: [ { $isArray: "$menu.sub_category.items.media" }, { $gt: [{ $size: "$menu.sub_category.items.media" }, 0] } ] },
                            then: { $let: { vars: { firstMedia: { $arrayElemAt: ["$menu.sub_category.items.media", 0] } }, in: "$$firstMedia.url" } },
                            else: { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                        }
                    },
                    thumbUrl: {
                        $cond: {
                            if: { $and: [ { $isArray: "$menu.sub_category.items.media" }, { $gt: [{ $size: "$menu.sub_category.items.media" }, 0] } ] },
                            then: { $let: { vars: { firstMedia: { $arrayElemAt: ["$menu.sub_category.items.media", 0] } }, in: { $ifNull: ["$$firstMedia.thumbUrl", "$$firstMedia.url"] } } },
                            else: { $ifNull: ["$menu.sub_category.items.image_url", "$menu.sub_category.items.image"] }
                        }
                    },
                    category: "$menu.name"
                }
            }
        ];

        const matchedItems = await Menu.aggregate(pipeline);

        // Map to standard format matching the manager.foodsnap.in API
        const results = matchedItems.map(item => ({
            _id: item.id || Math.random().toString(),
            title: item.name,
            image_url: item.image_url,
            thumb_url: item.thumbUrl || item.image_url,
            category: item.category || "Internal DB",
            approved: true,
            premium: false,
            _source: "internal"
        })).filter(img => img.image_url);

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
