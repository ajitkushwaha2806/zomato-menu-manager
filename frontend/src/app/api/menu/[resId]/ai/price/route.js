import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

function roundToNearest9(price) {
    const lower = Math.floor((price - 9) / 10) * 10 + 9;
    const upper = lower + 10;
    const result = (price - lower) <= (upper - price) ? lower : upper;
    return Math.max(9, result); // minimum price of 9
}

function roundToNext9(price) {
    const rounded = Math.ceil((price - 9) / 10) * 10 + 9;
    return Math.max(9, rounded);
}

export async function POST(req, { params }) {
    try {
        await dbConnect();

        const { resId } = await params;
        const { value, roundingOption = 'none' } = await req.json();

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

        const menu = await Menu.findOne({ resId });

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
        const categories = Array.isArray(menu?.menu) ? menu.menu : menu?.menu?.categories || [];
        categories.forEach((category) => {
            category.sub_category?.forEach(
                (subCategory) => {
                    subCategory.items?.forEach(
                        (item) => {
                            let isUpdated = false;
                            const currentPrice =
                                Number(item?.price);

                            if (
                                !isNaN(currentPrice) && item?.price !== undefined && item?.price !== null && item?.price !== ""
                            ) {
                                let newPrice;

                                if (
                                    isPercentage
                                ) {
                                    newPrice =
                                        currentPrice +
                                        (currentPrice *
                                            numericValue) /
                                        100;
                                } else {
                                    newPrice =
                                        currentPrice +
                                        numericValue;
                                }

                                let finalPrice = Math.round(Math.max(0, newPrice));
                                if (roundingOption === 'nearest_9') {
                                    finalPrice = roundToNearest9(finalPrice);
                                } else if (roundingOption === 'next_9') {
                                    finalPrice = roundToNext9(finalPrice);
                                }
                                item.price = finalPrice;

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
                                                if (roundingOption === 'nearest_9') {
                                                    finalOptPrice = roundToNearest9(finalOptPrice);
                                                } else if (roundingOption === 'next_9') {
                                                    finalOptPrice = roundToNext9(finalOptPrice);
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
                            }
                        }
                    );
                }
            );
        });

        menu.markModified("menu");
        await menu.save();

        return NextResponse.json({
            success: true,
            mode: isPercentage ? "percentage" : "absolute",
            value: adjustment,
            rounding: roundingOption,
            updated_items: updatedCount,
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