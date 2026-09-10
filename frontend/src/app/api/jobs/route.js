import dbConnect from "@/lib/dbConnect";
import MenuUploadJob from "@/model/menu-upload-job";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
    try {
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status");
        const restaurantId = searchParams.get("restaurant_id");
        const search = searchParams.get("search");
        const limit = parseInt(searchParams.get("limit") || "100", 10);
        const page = parseInt(searchParams.get("page") || "1", 10);

        const query = {};

        if (status && status !== "all") {
            query.status = status.toLowerCase();
        }

        if (restaurantId) {
            query.restaurant_id = restaurantId;
        }

        if (search) {
            query.$or = [
                { job_id: { $regex: search, $options: "i" } },
                { restaurant_id: { $regex: search, $options: "i" } },
                { platform: { $regex: search, $options: "i" } },
                { "files.filename": { $regex: search, $options: "i" } },
            ];
        }

        const totalJobs = await MenuUploadJob.countDocuments(query);
        const jobs = await MenuUploadJob.find(query)
            .sort({ created_at: -1, createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Add item/category summaries for each job
        const enhancedJobs = jobs.map((job) => {
            let categoryCount = 0;
            let itemCount = 0;
            let sampleCategories = [];

            const chainOutputs = job.chain_outputs || {};
            const normalizedMenu = chainOutputs.normalized_menu;
            const mergedItems = chainOutputs.merged_items;
            const parsedMenus = chainOutputs.parsed_menus;

            if (normalizedMenu && Array.isArray(normalizedMenu.category)) {
                categoryCount = normalizedMenu.category.length;
                sampleCategories = normalizedMenu.category.slice(0, 3).map((c) => c.name);
                normalizedMenu.category.forEach((cat) => {
                    if (Array.isArray(cat.sub_category)) {
                        cat.sub_category.forEach((sub) => {
                            if (Array.isArray(sub.items)) {
                                itemCount += sub.items.length;
                            }
                        });
                    }
                });
            } else if (mergedItems && Array.isArray(mergedItems.items)) {
                itemCount = mergedItems.items.length;
                const catSet = new Set(mergedItems.items.map((i) => i.category).filter(Boolean));
                categoryCount = catSet.size;
                sampleCategories = Array.from(catSet).slice(0, 3);
            } else if (Array.isArray(parsedMenus) && parsedMenus.length > 0) {
                parsedMenus.forEach((pm) => {
                    if (Array.isArray(pm.items)) {
                        itemCount += pm.items.length;
                        const catSet = new Set(pm.items.map((i) => i.category).filter(Boolean));
                        categoryCount += catSet.size;
                        if (sampleCategories.length < 3) {
                            sampleCategories = Array.from(catSet).slice(0, 3);
                        }
                    }
                });
            }

            return {
                ...job,
                _id: job._id?.toString(),
                summary: {
                    has_data: itemCount > 0 || categoryCount > 0,
                    category_count: categoryCount,
                    item_count: itemCount,
                    sample_categories: sampleCategories,
                },
            };
        });

        // Summary counts across all jobs
        const stats = {
            total: totalJobs,
            completed: await MenuUploadJob.countDocuments({ status: "completed" }),
            processing: await MenuUploadJob.countDocuments({ status: { $in: ["processing", "queued"] } }),
            failed: await MenuUploadJob.countDocuments({ status: "failed" }),
        };

        return NextResponse.json({
            success: true,
            data: enhancedJobs,
            stats,
            pagination: {
                total: totalJobs,
                page,
                limit,
                pages: Math.ceil(totalJobs / limit),
            },
        });
    } catch (error) {
        console.error("Error fetching queue jobs:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to fetch queue jobs",
            },
            { status: 500 }
        );
    }
}
