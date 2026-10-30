import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";

export const dynamic = "force-dynamic";

/**
 * GET /api/menu/[resId]/petpooja/items/[itemId]
 * Fetches complete item details from Petpooja.
 */
export async function GET(req, { params }) {
    try {
        const { resId, itemId } = await params;
        if (!itemId) {
            return NextResponse.json(
                { success: false, message: "Item ID is required" },
                { status: 400 }
            );
        }

        const response = await petpoojaClient({
            req,
            endpoint: `/api/v1/menu/items/${itemId}`,
            method: "GET",
        });

        if (!response || response.success === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: response?.message || "Failed to fetch item information from Petpooja",
                },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: response.data || response,
        });
    } catch (error) {
        console.error("Petpooja Get Item Info Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/menu/[resId]/petpooja/items/[itemId]
 * Updates item information on Petpooja.
 */
export async function PUT(req, { params }) {
    try {
        const { resId, itemId } = await params;
        if (!itemId) {
            return NextResponse.json(
                { success: false, message: "Item ID is required" },
                { status: 400 }
            );
        }

        const body = await req.json();

        // If body has partial data (e.g. only images or info), fetch complete item first and merge
        let payload = body;
        if (!body.info || !body.channels) {
            const currentResp = await petpoojaClient({
                req,
                endpoint: `/api/v1/menu/items/${itemId}`,
                method: "GET",
            });
            const rawData = currentResp?.data?.data || currentResp?.data?.item || currentResp?.data || currentResp;
            const currentItem = (rawData && typeof rawData === 'object' && (rawData.info || rawData.name || rawData.price)) ? rawData : (rawData?.data || rawData);
            if (!currentItem) {
                return NextResponse.json(
                    { success: false, message: "Could not fetch current item to merge update" },
                    { status: 404 }
                );
            }
            const currentInfo = currentItem.info || {};
            const bodyInfo = body.info || {};

            // Dietary: Petpooja expects "veg", "non-veg", or "egg"
            let dietary = bodyInfo.dietary || currentInfo.dietary || currentItem.dietary || bodyInfo.food_type || currentInfo.food_type || currentItem.food_type || "veg";
            if (dietary.toLowerCase() === "non_veg") dietary = "non-veg";
            else dietary = dietary.toLowerCase();

                const existingExtraInfo = (bodyInfo.extra_info && typeof bodyInfo.extra_info === "object")
                    ? bodyInfo.extra_info
                    : (currentInfo.extra_info && typeof currentInfo.extra_info === "object"
                        ? currentInfo.extra_info
                        : (currentItem.extra_info && typeof currentItem.extra_info === "object"
                            ? currentItem.extra_info
                            : {}));

                let boneProperty = existingExtraInfo.bone_property || currentItem.bone_property || null;
                if (boneProperty && typeof boneProperty === "string") {
                    boneProperty = boneProperty.toUpperCase();
                } else if (dietary === "non-veg") {
                    const itemNameLower = (bodyInfo.name || currentInfo.name || currentItem.name || "").toLowerCase();
                    if (/\b(bone|bones|leg|legs|wing|wings|drumstick|drumsticks|shank|shanks|rib|ribs|chop|chops)\b/i.test(itemNameLower) && !/\bboneless\b/i.test(itemNameLower)) {
                        boneProperty = "BONE";
                    } else if (/\bboneless\b/i.test(itemNameLower)) {
                        boneProperty = "BONELESS";
                    } else {
                        boneProperty = "NOT_APPLICABLE";
                    }
                }

                const extra_info = {
                    alt_lang: existingExtraInfo.alt_lang || "",
                    alt_lang_desc: existingExtraInfo.alt_lang_desc || "",
                    portion_size: existingExtraInfo.portion_size ?? null,
                    portion_size_value: existingExtraInfo.portion_size_value ?? null,
                    serving_size: existingExtraInfo.serving_size || "",
                    bone_property: boneProperty,
                    rm_dinein_qr: Number(existingExtraInfo.rm_dinein_qr ?? 0),
                    ignore_addon: Number(existingExtraInfo.ignore_addon ?? 0),
                    ig_pc: Number(existingExtraInfo.ig_pc ?? 0),
                    i_c: existingExtraInfo.i_c && typeof existingExtraInfo.i_c === "object" ? existingExtraInfo.i_c : { key: "3", value: "" },
                    ih_c: existingExtraInfo.ih_c && typeof existingExtraInfo.ih_c === "object" ? existingExtraInfo.ih_c : { key: "2", value: "" },
                };

                const info = {
                    category_id: Number(bodyInfo.category_id || currentInfo.category_id || currentItem.category_id || currentItem.category?.id),
                    name: bodyInfo.name || currentInfo.name || currentItem.name || "",
                    online_display_name: bodyInfo.online_display_name || currentInfo.online_display_name || currentItem.online_display_name || bodyInfo.name || currentInfo.name || currentItem.name || "",
                    short_name: bodyInfo.short_name || currentInfo.short_name || currentItem.short_name || "",
                    dietary: dietary,
                    price: Number(bodyInfo.price ?? currentInfo.price ?? currentItem.price ?? 0),
                    reduced_price: bodyInfo.reduced_price ?? currentInfo.reduced_price ?? currentItem.reduced_price ?? null,
                    packing_charges: Number(bodyInfo.packing_charges ?? currentInfo.packing_charges ?? currentItem.packing_charges ?? 0),
                    type: bodyInfo.type || currentInfo.type || currentItem.type || "M",
                    description: bodyInfo.description ?? currentInfo.description ?? currentItem.description ?? null,
                    minimum_delivery_time: Number(bodyInfo.minimum_delivery_time ?? 0),
                    ignore_taxes: Number(bodyInfo.ignore_taxes ?? 0),
                    ignore_discounts: Number(bodyInfo.ignore_discounts ?? 0),
                    hsn_code: bodyInfo.hsn_code ?? null,
                    sap_code: bodyInfo.sap_code ?? null,
                    goods_attribute: bodyInfo.goods_attribute || currentInfo.goods_attribute || currentItem.goods_attribute || "services",
                    days_id: String(bodyInfo.days_id || currentInfo.days_id || "-1"),
                    schedule: bodyInfo.schedule || currentInfo.schedule || { enabled: false, blocks: [] },
                    order_type: Array.isArray(bodyInfo.order_type) && bodyInfo.order_type.length > 0
                        ? bodyInfo.order_type
                        : (Array.isArray(currentInfo.order_type) && currentInfo.order_type.length > 0
                            ? currentInfo.order_type
                            : (Array.isArray(currentItem.order_type) && currentItem.order_type.length > 0 ? currentItem.order_type : [1, 3])),
                    desktop_order_type: Array.isArray(bodyInfo.desktop_order_type) && bodyInfo.desktop_order_type.length > 0
                        ? bodyInfo.desktop_order_type
                        : (Array.isArray(currentInfo.desktop_order_type) && currentInfo.desktop_order_type.length > 0 ? currentInfo.desktop_order_type : [1]),
                    extra_info,
                };

            const imageKey = (body.images !== undefined && body.images.main !== undefined)
                ? body.images.main
                : (currentItem.images?.main || null);

            payload = {
                info,
                modifiers: body.modifiers || currentItem.modifiers || { allow_variation: 0, allow_addon: 0, addon_based_on: 0, variants: [], addon_groups: [] },
                channels: body.channels || currentItem.channels || { in_house: [], integrated: [] },
                taxes: body.taxes || currentItem.taxes || { tax_ids: [] },
                tags: body.tags || currentItem.tags || { attributes: [], recommended: false, favorite: false, description_tag: null },
                upsell: body.upsell || currentItem.upsell || { suggested_items: [] },
                images: imageKey ? { main: imageKey } : { main: null },
                nutrition: body.nutrition || currentItem.nutrition || {
                    calories: null, protein: null, carbohydrate: null, total_fat: null, fiber: null,
                    total_sugar: null, sodium: null, cholesterol: null, trans_fat: null, saturated_fat: null,
                    added_sugar: null, vitamins: [], additive_map: {}, allergens: [], additional_info: "",
                    remark: "", serving_info: ""
                },
            };
        }

        const response = await petpoojaClient({
            req,
            endpoint: `/api/v1/menu/items/${itemId}`,
            method: "PUT",
            data: payload,
        });

        if (response?.success === 0 || response?.error || response?.errors) {
            const rawErr = response?.errors || response?.error;
            let errMsg = "Petpooja item update failed";
            if (Array.isArray(rawErr)) {
                errMsg = rawErr.join(", ");
            } else if (typeof rawErr === "object" && rawErr !== null) {
                errMsg = Object.entries(rawErr)
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                    .join("; ");
            } else if (typeof rawErr === "string") {
                errMsg = rawErr;
            } else if (response?.message) {
                errMsg = response.message;
            }

            return NextResponse.json(
                {
                    success: false,
                    message: errMsg,
                    details: response,
                },
                { status: 422 }
            );
        }

        // Also update local MongoDB cache if present
        try {
            await dbConnect();
            const menuDoc = await Menu.findOne({ resId: String(resId), platform: "petpooja" });
            if (menuDoc && Array.isArray(menuDoc.menu)) {
                let updated = false;
                for (const cat of menuDoc.menu) {
                    for (const sub of (cat.sub_category || [])) {
                        for (const it of (sub.items || [])) {
                            if (String(it.id) === String(itemId)) {
                                if (payload.info?.name) it.name = payload.info.name;
                                if (payload.info?.price !== undefined) {
                                    it.price = Number(payload.info.price);
                                    it.base_price = Number(payload.info.price);
                                }
                                if (payload.images?.main) {
                                    it.media = [{ key: payload.images.main, url: `/uploads/petpooja/${payload.images.main}` }];
                                } else if (payload.images && payload.images.main === null) {
                                    it.media = [];
                                }
                                updated = true;
                                break;
                            }
                        }
                        if (updated) break;
                    }
                    if (updated) break;
                }
                if (updated) {
                    menuDoc.markModified("menu");
                    await menuDoc.save();
                }
            }
        } catch (dbErr) {
            console.warn("Could not sync updated Petpooja item to MongoDB:", dbErr?.message);
        }

        return NextResponse.json({
            success: true,
            data: response.data || response,
            message: response.message || "Item updated successfully on Petpooja",
        });
    } catch (error) {
        console.error("Petpooja Put Item Info Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}
