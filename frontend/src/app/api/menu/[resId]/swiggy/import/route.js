import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";

export async function GET(req, { params }) {
    try {
        await dbConnect()
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        const response = await SwiggyClient({
            req,
            endpoint: `/api/cms/menu-revision/v1/restaurant-menu-wrapper/${resId}`,
            method: "GET",
            params: {
                disabled: true,
                item_slots: true,
                tickets: true,
            },
        });

        const menu = response?.data?.data?.menu;
        const items = menu?.items_vo || [];

        if (!menu) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu not found",
                },
                { status: 404 }
            );
        }

        const categoriesOrder = menu?.categories_order || [];
        // Removed parsedAddonsMap
        const itemsMap = Object.fromEntries(
            items.map((itemData) => {
                const item = itemData.item || {};

                // Convert Swiggy variants to Zomato variants format
                const parsedVariants = (itemData.variant_groups_vo || []).map((group) => {
                    const options = (group.variants_vo || []).map((variantVo, index) => {
                        return {
                            option_name: variantVo.variant?.name || "",
                            option_id: variantVo.variant?.id || "",
                            variant_id: variantVo.variant?.id || "", // Swiggy doesn't have a separate variant_id/option_id split usually
                            price: (variantVo.variant?.price || 0) + (item?.price || 0), // Base price + variant price
                            is_veg: variantVo.variant?.is_veg === "1" ? "VEG" : (variantVo.variant?.is_veg === "2" ? "NON_VEG" : "NONE"),
                        };
                    }).sort((a, b) => a.price - b.price).map((opt, i) => {
                        opt.is_default = (i === 0);
                        return opt;
                    });

                    return {
                        property_name: group.variant_group?.name || "",
                        property_id: group.variant_group?.id || "",
                        options
                    };
                });

                // Calculate base_price taking lowest variant into account
                let base_price = item?.price || 0;
                if (parsedVariants && parsedVariants.length > 0) {
                    let lowestPrice = Infinity;
                    parsedVariants.forEach(v => {
                        v.options?.forEach(opt => {
                            if (opt.price > 0 && opt.price < lowestPrice) {
                                lowestPrice = opt.price;
                            }
                        });
                    });
                    if (lowestPrice !== Infinity) {
                        base_price = lowestPrice;
                    }
                    parsedVariants.sort((a, b) => {
                        const minA = a.options?.[0]?.price || 0;
                        const minB = b.options?.[0]?.price || 0;
                        return minA - minB;
                    });
                }

                // Removed Addon Parsing logic

                let media = [];
                if (item.image_url) {
                    media.push({
                        url: item.image_url,
                        fileDirectory: "",
                        image_id: item.image_id || "",
                    });
                }

                let is_veg = "VEG";
                if (item.is_veg === "2" || item.is_veg === 2) is_veg = "NON_VEG";
                else if (item.is_veg === "3" || item.is_veg === 3) is_veg = "EGG";

                return [
                    item.id,
                    {
                        id: item.id || "",
                        temp_id: "",
                        name: item.name || "",
                        description: item.description || "",
                        base_price,
                        is_veg,
                        packing_charges: item.packing_charges || 0,
                        media,
                        variants: parsedVariants,
                        meatTypes: null,
                        onHold: false,
                        holdComments: [],
                        addons: []
                    }
                ];
            })
        );

        // Removed parsedAddons

        const formattedCategories = categoriesOrder.map((category) => ({
            id: category?.id,
            name: category?.name,
            temp_id: category?.temp_id,
            sub_category: (category?.sub_categories_order || []).map(
                (subCategory) => ({
                    id: subCategory?.id,
                    temp_id: subCategory?.temp_id,
                    name: subCategory?.name,
                    items: (subCategory?.items_order || []).map(
                        (itemRef) => itemsMap[itemRef?.id] || null
                    ).filter(Boolean),
                })
            ),
        }));

        const savedMenu = await Menu.findOneAndUpdate(
            { resId, platform: "swiggy" },
            {
                resId,
                platform: "swiggy",
                menu: formattedCategories,
                addons: [],
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        return NextResponse.json({
            success: true,
            message: "Menu fetched successfully",
            data: savedMenu,
            parsedAddons: [],
            result: response // Return raw response like Zomato for debugging
        }, { status: 200 });
    } catch (error) {
        console.error("Menu Fetch Error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message || "Failed to fetch menu",
            },
            { status: 500 }
        );
    }
}