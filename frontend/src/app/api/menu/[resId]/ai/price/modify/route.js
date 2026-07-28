import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { modifyPricesWithAI } from "@/services/gemini/price-modifier";

/**
 * Rounds a price to the nearest value ending in 9.
 * Examples: 105 → 109, 112 → 109, 115 → 119, 100 → 99, 220 → 219
 */
function roundToNearest9(price) {
    const lower = Math.floor((price - 9) / 10) * 10 + 9;
    const upper = lower + 10;
    const result = (price - lower) <= (upper - price) ? lower : upper;
    return Math.max(9, result); // minimum price of 9
}

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json({ success: false, message: "resId is required" }, { status: 400 });
        }

        const formData = await req.formData();
        const file = formData.get("file");

        if (!file) {
            return NextResponse.json({ success: false, message: "Reference file is required" }, { status: 400 });
        }

        const menu = await Menu.findOne({ resId });
        if (!menu) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        // Flatten current menu into simplified context for the AI
        // Do NOT send the old prices or variants, otherwise the AI might just regurgitate them.
        const currentItemsContext = [];
        const categories = Array.isArray(menu?.menu) ? menu.menu : menu?.menu?.categories || [];
        categories.forEach((category) => {
            category.sub_category?.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    currentItemsContext.push({
                        id: item.id,
                        name: item.name
                    });
                });
            });
        });

        // Convert uploaded file to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mimeType = file.type;

        // Pass to AI
        const aiResponse = await modifyPricesWithAI(buffer, mimeType, currentItemsContext);
        const updatedAiItems = aiResponse.updated_items || [];

        if (updatedAiItems.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No price changes detected or matched by AI",
                updated_items: 0,
                queued_items: 0
            });
        }

        // Map AI changes back to DB items and queue
        const updatedItems = [];
        let updatedCount = 0;

        const categoriesForUpdate = Array.isArray(menu?.menu) ? menu.menu : menu?.menu?.categories || [];

        categoriesForUpdate.forEach((category) => {
            category.sub_category?.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    const aiMatch = updatedAiItems.find(aiItem => aiItem.id === item.id);
                    if (aiMatch) {
                        let isUpdated = false;

                        if (aiMatch.price !== undefined) {
                            const roundedNewPrice = roundToNearest9(Math.max(0, aiMatch.price));
                            if (item.price !== roundedNewPrice) {
                                item.price = roundedNewPrice;
                                isUpdated = true;
                            }
                        }

                        // Update variant prices if AI matched them
                        if (aiMatch.variants && item.variants) {
                            aiMatch.variants.forEach(aiVarGroup => {
                                const dbVarGroup = item.variants.find(vg =>
                                    (vg.property_name || vg.name) === aiVarGroup.property_name
                                );
                                if (dbVarGroup) {
                                    aiVarGroup.options.forEach(aiOpt => {
                                        const dbOpt = dbVarGroup.options.find(opt =>
                                            (opt.option_name || opt.name) === aiOpt.option_name
                                        );
                                        if (dbOpt && aiOpt.price !== undefined) {
                                            const roundedNewOptPrice = roundToNearest9(Math.max(0, aiOpt.price));
                                            if (dbOpt.price !== roundedNewOptPrice) {
                                                dbOpt.price = roundedNewOptPrice;
                                                isUpdated = true;
                                            }
                                        }
                                    });
                                }
                            });
                        }

                        if (isUpdated) {
                            updatedCount++;
                            if (item.id) {
                                updatedItems.push({
                                    id: item.id,
                                    action: "update",
                                    status: "pending",
                                    price: item.price,
                                    variants: item.variants || [],
                                    name: item.name,
                                    description: item.description,
                                    is_veg: item.is_veg,
                                    image_url: item.image_url || "",
                                    image_id: item.image_id || "",
                                    categoryId: category.id,
                                    categoryName: category.name,
                                    subCategoryId: subCategory.id,
                                    subCategoryName: subCategory.name,
                                });
                            }
                        }
                    }
                });
            });
        });

        // Save DB
        menu.markModified("menu");
        await menu.save();

        return NextResponse.json({
            success: true,
            rounding: "nearest_9",
            updated_ai_items: updatedAiItems,
            updated_items: updatedCount,
            updated_items_data: updatedItems,
            current_items_context: currentItemsContext
        });

    } catch (error) {
        console.error("AI price modification error:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Something went wrong" },
            { status: 500 }
        );
    }
}