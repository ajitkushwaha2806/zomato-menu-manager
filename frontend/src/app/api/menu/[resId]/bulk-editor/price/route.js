import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

function roundToNearest9(price) {
    const lower = Math.floor((price - 9) / 10) * 10 + 9;
    const upper = lower + 10;
    const result = (price - lower) <= (upper - price) ? lower : upper;
    return Math.max(9, result);
}

function roundToNext9(price) {
    return Math.max(9, Math.ceil((price - 9) / 10) * 10 + 9);
}

export async function POST(req, { params }) {
    try {
        await dbConnect();

        const { resId } = await params;
        const { value, roundTo9 = false, roundMode = "none", targetSelection = "all", selectedItems = [], preview = false, platform } = await req.json();
        
        let actualRoundMode = roundMode;
        if (roundMode === "none" && roundTo9) {
            actualRoundMode = "nearest9"; // backward compatibility
        }

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "resId is required",
                },
                { status: 400 }
            );
        }

        if (
            value === undefined ||
            value === null ||
            String(value).trim() === ""
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "value is required",
                },
                { status: 400 }
            );
        }

        const query = { resId };
        if (platform) {
            query.platform = platform;
        }

        const menu = await Menu.findOne(query);

        if (!menu) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu not found",
                },
                { status: 404 }
            );
        }

        const adjustment = String(value).trim();

        const isPercentage =
            adjustment.endsWith("%");

        const numericValue = Number(
            adjustment.replace("%", "")
        );

        if (isNaN(numericValue)) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Invalid value. Examples: 10%, -10%, 20, -20",
                },
                { status: 400 }
            );
        }

        let updatedCount = 0;
        const previewItems = [];
        const categories = Array.isArray(menu?.menu) ? menu.menu : menu?.menu?.categories || [];
        categories.forEach((category) => {

            category.sub_category?.forEach(
                (subCategory) => {
                    subCategory.items?.forEach(
                        (item) => {
                            if (targetSelection === "items" && !selectedItems.includes(item.id)) {
                                return;
                            }

                            let isUpdated = false;
                            const rawPrice = item?.base_price ?? item?.price;
                            const currentPrice = Number(rawPrice);

                            if (
                                !isNaN(currentPrice) && rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== ""
                            ) {
                                let newPrice;

                                if (isPercentage) {
                                    newPrice = currentPrice + (currentPrice * numericValue) / 100;
                                } else {
                                    newPrice = currentPrice + numericValue;
                                }

                                let finalPrice = Math.round(Math.max(0, newPrice));
                                if (actualRoundMode === "nearest9") {
                                    finalPrice = roundToNearest9(Math.max(0, newPrice));
                                } else if (actualRoundMode === "next9") {
                                    finalPrice = roundToNext9(Math.max(0, newPrice));
                                }

                                if (preview) {
                                    previewItems.push({
                                        id: item.id,
                                        name: item.name,
                                        oldPrice: currentPrice,
                                        newPrice: finalPrice,
                                        categoryName: category.name
                                    });
                                }

                                item.base_price = finalPrice;
                                if (item.price !== undefined) delete item.price; // Clean up old price if any

                                isUpdated = true;
                            }

                            if (item?.variants && Array.isArray(item.variants)) {
                                item.variants.forEach((group) => {
                                    if (group?.options && Array.isArray(group.options)) {
                                        group.options.forEach((opt) => {
                                            const currentOptPrice = Number(opt?.price);
                                            if (!isNaN(currentOptPrice) && opt?.price !== undefined && opt?.price !== null && opt?.price !== "") {
                                                let newOptPrice;
                                                if (isPercentage) {
                                                    newOptPrice = currentOptPrice + (currentOptPrice * numericValue) / 100;
                                                } else {
                                                    newOptPrice = currentOptPrice + numericValue;
                                                }
                                                let finalOptPrice = Math.round(Math.max(0, newOptPrice));
                                                if (actualRoundMode === "nearest9") {
                                                    finalOptPrice = roundToNearest9(Math.max(0, newOptPrice));
                                                } else if (actualRoundMode === "next9") {
                                                    finalOptPrice = roundToNext9(Math.max(0, newOptPrice));
                                                }
                                                opt.price = finalOptPrice;
                                                isUpdated = true;
                                            }
                                        });
                                    }
                                });
                            }

                            if (isUpdated) {
                                updatedCount++;
                                if (!preview) {
                                    if (item.temp_id && String(item.temp_id).startsWith('temp-')) {
                                        // It's a new item, leave temp_id as is so it triggers a create
                                    } else {
                                        const baseId = String(item.id).replace(/^update-/, '');
                                        item.temp_id = `update-${baseId}`;
                                    }
                                }
                            }
                        }
                    );
                }
            );
        });

        if (!preview) {
            menu.markModified("menu");
            await menu.save();
        }

        return NextResponse.json({
            success: true,
            mode: isPercentage ? "percentage" : "absolute",
            value: adjustment,
            rounding: "nearest_9",
            updated_items: updatedCount,
            previewItems: preview ? previewItems : undefined,
            previewMenu: preview ? menu.menu : undefined
        });
    } catch (error) {
        console.error(
            "Bulk price update error:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message ||
                    "Something went wrong",
            },
            {
                status: 500,
            }
        );
    }
}