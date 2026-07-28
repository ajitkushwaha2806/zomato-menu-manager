import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { generateMenuDescriptions } from "@/services/ai/generate-description";

const BATCH_SIZE = 40;
const CONCURRENCY = 1;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(array, size) {
    const chunks = [];

    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }

    return chunks;
}

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "resId is required",
                },
                {
                    status: 400,
                },
            );
        }

        const body = await req.json().catch(() => ({}));
        const platform = body.platform || "zomato";
        
        const menu = await Menu.findOne({ resId, platform });

        if (!menu) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu not found",
                },
                {
                    status: 404,
                },
            );
        }

        const itemsToProcess = [];
        const categories = Array.isArray(menu?.menu)
            ? menu.menu
            : menu?.menu?.categories || [];

        categories.forEach((category) => {
            const subCats = category.sub_category || category.sub_categories || [];
            subCats.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    if (
                        item?.id != null &&
                        typeof item?.name === "string" &&
                        item.name.trim() &&
                        (!item.description || item.description.trim() === "")
                    ) {
                        itemsToProcess.push({
                            item_id: String(item.id),
                            name: item.name.trim(),
                        });
                    }
                });
            });
        });

        if (itemsToProcess.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No items found to process",
                },
                {
                    status: 400,
                },
            );
        }

        const batches = chunk(itemsToProcess, BATCH_SIZE);

        const results = [];

        for (let i = 0; i < batches.length; i += CONCURRENCY) {
            const currentBatches = batches.slice(i, i + CONCURRENCY);

            const responses = await Promise.all(
                currentBatches.map((batch) => generateMenuDescriptions(batch)),
            );

            results.push(...responses.flat());

            if (i + CONCURRENCY < batches.length) {
                await delay(2000); // 2 second delay between batches to prevent 429 Too Many Requests
            }
        }

        const descriptionMap = new Map(
            results
                .filter((item) => item?.item_id && item?.description)
                .map((item) => [String(item.item_id), item.description]),
        );

        let updatedCount = 0;

        categories.forEach((category) => {
            const subCats = category.sub_category || category.sub_categories || [];
            subCats.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    const description = descriptionMap.get(String(item.id));

                    if (description) {
                        item.description = description;
                        if (item.temp_id && String(item.temp_id).startsWith('temp-')) {
                            // leave as is
                        } else {
                            item.temp_id = `update-${String(item.id).replace(/^update-/, '')}`;
                        }
                        updatedCount++;
                    }
                });
            });
        });

        menu.markModified("menu");
        await menu.save();

        return NextResponse.json({
            success: true,
            total_items: itemsToProcess.length,
            total_generated: results.length,
            updated_items: updatedCount,
            total_batches: batches.length,
        });
    } catch (error) {
        console.error("Description generation route error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Something went wrong",
            },
            {
                status: 500,
            },
        );
    }
}
