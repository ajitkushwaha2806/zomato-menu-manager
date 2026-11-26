import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { buildOwnlyItemAttributesPayload, buildOwnlyUpdateItemPayload, buildOwnlyCreateItemPayload, executeOwnlyItemUpdate } from "@/lib/payload/ownly/item-payload";

export const dynamic = "force-dynamic";

/**
 * Builds the exact JSON payload expected by Ownly's item-attributes API
 */
export function buildOwnlyItemPayload(resId, itemId, currentItem, category, body = {}, subcategory = {}) {
    return buildOwnlyItemAttributesPayload({
        resId,
        itemId,
        currentItem,
        body,
    });
}

/**
 * GET /api/menu/[resId]/ownly/items/[itemId]
 */
export async function GET(req, { params }) {
    try {
        const { resId, itemId } = await params;
        await dbConnect();

        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" }).lean();
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json({ success: false, message: "Menu not found" }, { status: 404 });
        }

        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                for (const item of sub.items || []) {
                    if (String(item.id) === String(itemId)) {
                        return NextResponse.json({
                            success: true,
                            item,
                            category: { id: cat.id, name: cat.name },
                        });
                    }
                }
            }
        }

        return NextResponse.json({ success: false, message: "Item not found in database" }, { status: 404 });
    } catch (err) {
        console.error("Ownly GET Item Error:", err);
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}

/**
 * PUT /api/menu/[resId]/ownly/items/[itemId]
 * Updates item on Ownly (PUT https://rx-api.pd.ownly.food/api/v1/menu/item) and syncs MongoDB
 */
export async function PUT(req, { params }) {
    try {
        const { resId, itemId } = await params;
        if (!resId || !itemId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID and Item ID are required." },
                { status: 400 }
            );
        }

        const body = await req.json();
        await dbConnect();

        // 1. Find existing item in MongoDB
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (!menuDoc || !Array.isArray(menuDoc.menu)) {
            return NextResponse.json(
                { success: false, message: "Menu not found for this restaurant on Ownly platform." },
                { status: 404 }
            );
        }

        let currentItem = null;
        let parentCat = null;
        let parentSub = null;

        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                for (const it of sub.items || []) {
                    if (String(it.id) === String(itemId)) {
                        currentItem = it;
                        parentCat = cat;
                        parentSub = sub;
                        break;
                    }
                }
                if (currentItem) break;
            }
            if (currentItem) break;
        }

        if (!currentItem) {
            return NextResponse.json(
                { success: false, message: `Item #${itemId} not found in restaurant menu.` },
                { status: 404 }
            );
        }

        // 2. Execute 2-step Ownly item update (POST /item-attributes/prepare -> POST /item-attributes)
        const { ownlyResponse, attributesPayload } = await executeOwnlyItemUpdate({
            req,
            resId,
            itemId,
            currentItem,
            category: parentCat,
            subcategory: parentSub,
            body,
            menuDoc,
        });

        const resData = ownlyResponse.data;
        const updatedItemData = attributesPayload.update_request?.item || {};

        // 4. Update MongoDB item fields
        if (updatedItemData.name) currentItem.name = updatedItemData.name;
        if (updatedItemData.description !== undefined) currentItem.description = updatedItemData.description;
        if (updatedItemData.price !== undefined) {
            currentItem.price = updatedItemData.price;
            currentItem.base_price = updatedItemData.price;
            currentItem.min_price = updatedItemData.price;
            currentItem.max_price = updatedItemData.price;
        }
        if (updatedItemData.imageUrl) {
            currentItem.imageUrl = updatedItemData.imageUrl;
            currentItem.image_url = updatedItemData.imageUrl;
            currentItem.media = [
                {
                    url: updatedItemData.imageUrl,
                    thumbUrl: updatedItemData.imageUrl,
                    sourceUrl: body.sourceUrl || "",
                    isNewlyUploaded: true,
                },
            ];
        }
        if (updatedItemData.foodType) {
            currentItem.is_veg = updatedItemData.foodType === "non-veg" ? "NON_VEG" : (updatedItemData.foodType === "egg" ? "EGG" : "VEG");
        }
        if (updatedItemData.inStock !== undefined) {
            currentItem.status = updatedItemData.inStock;
            currentItem.inStock = updatedItemData.inStock;
        }

        if (currentItem.raw && typeof currentItem.raw === "object") {
            if (updatedItemData.name) currentItem.raw.name = updatedItemData.name;
            if (updatedItemData.description !== undefined) currentItem.raw.description = updatedItemData.description;
            if (updatedItemData.price !== undefined) currentItem.raw.price = updatedItemData.price;
            if (updatedItemData.imageUrl) currentItem.raw.imageUrl = updatedItemData.imageUrl;
            if (updatedItemData.foodType) currentItem.raw.foodType = updatedItemData.foodType;
        }

        await Menu.updateOne(
            { _id: menuDoc._id },
            { $set: { menu: menuDoc.menu } }
        );

        return NextResponse.json({
            success: true,
            message: resData?.message || "Menu item updated successfully on Ownly",
            data: resData,
            item: currentItem,
        });
    } catch (err) {
        console.error("Ownly PUT Item Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to update item on Ownly",
            },
            { status: err.response?.status || 500 }
        );
    }
}

/**
 * DELETE /api/menu/[resId]/ownly/items/[itemId]
 * Deletes item from Ownly (DELETE https://rxapi.ownly.food/api/v1/menu/item) and syncs MongoDB
 */
export async function DELETE(req, { params }) {
    try {
        const { resId, itemId } = await params;
        if (!resId || !itemId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID and Item ID are required." },
                { status: 400 }
            );
        }

        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });

        let targetCatId = null;
        let targetSubId = null;

        if (menuDoc?.menu) {
            for (const cat of menuDoc.menu) {
                for (const sub of cat.sub_category || []) {
                    for (const it of sub.items || []) {
                        if (String(it.id) === String(itemId)) {
                            targetCatId = cat.id;
                            targetSubId = sub.id;
                            break;
                        }
                    }
                    if (targetCatId) break;
                }
                if (targetCatId) break;
            }
        }

        const isTemp = String(itemId).startsWith("temp-") || String(itemId).startsWith("temp_");
        let ownlyData = null;

        if (!isTemp) {
            const deletePayload = {
                restaurantId: String(resId),
                categoryId: String(targetCatId || `CAT_${resId}`),
                subcategoryId: (targetSubId && !String(targetSubId).startsWith("sub-") && !String(targetSubId).startsWith("temp"))
                    ? String(targetSubId)
                    : null,
                itemId: String(itemId),
            };

            const ownlyRes = await ownlyClient({
                req,
                endpoint: "/api/v1/menu/item",
                method: "DELETE",
                data: deletePayload,
            });
            ownlyData = ownlyRes.data;
        }

        if (menuDoc?.menu) {
            for (const cat of menuDoc.menu) {
                for (const sub of cat.sub_category || []) {
                    if (Array.isArray(sub.items)) {
                        sub.items = sub.items.filter((it) => String(it.id) !== String(itemId));
                    }
                }
            }
            await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });
        }

        return NextResponse.json({
            success: true,
            message: "Item deleted successfully from Ownly",
            data: ownlyData,
        });
    } catch (err) {
        console.error("Ownly DELETE Item Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to delete item from Ownly",
            },
            { status: err.response?.status || 500 }
        );
    }
}

