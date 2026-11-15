import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";

export const dynamic = "force-dynamic";

/**
 * Builds the exact JSON payload expected by Ownly's PUT /api/v1/menu/item
 */
export function buildOwnlyItemPayload(resId, itemId, currentItem, category, body = {}) {
    const raw = currentItem?.raw || {};

    const name = body.name?.trim() || currentItem?.name?.trim() || "Item";
    const description = body.description !== undefined ? body.description?.trim() : (currentItem?.description?.trim() || "");

    const price = Number(
        body.price !== undefined ? body.price : (currentItem?.price !== undefined ? currentItem.price : (currentItem?.base_price ?? 0))
    );

    const imageUrl =
        body.imageUrl ||
        body.image_url ||
        (Array.isArray(body.media) && body.media[0]?.url) ||
        currentItem?.imageUrl ||
        currentItem?.image_url ||
        (Array.isArray(currentItem?.media) && currentItem.media[0]?.url) ||
        raw.imageUrl ||
        "";

    let foodType = "veg";
    const rawFoodType = (body.foodType || body.is_veg || currentItem?.is_veg || raw.foodType || "veg").toLowerCase();
    if (rawFoodType === "non_veg" || rawFoodType === "non-veg") {
        foodType = "non-veg";
    } else if (rawFoodType === "egg") {
        foodType = "egg";
    }

    const catId = String(category?.id || raw.categoryId || `CAT_${resId}`);
    const catName = category?.name?.trim() || "Menu";

    const categoryObj = {
        id: catId,
        name: catName,
        description: category?.description || "",
        imageUrl: category?.imageUrl || "",
        providerId: catId,
        sortOrder: category?.sortOrder ?? 0,
    };

    const billComponents = raw.billComponents && Array.isArray(raw.billComponents.taxes) && raw.billComponents.taxes.length > 0
        ? raw.billComponents
        : {
              taxes: [
                  {
                      id: "GST_5",
                      providerId: "GST_5",
                      name: "GST (2.5% CGST + 2.5% SGST)",
                      value: 5.0,
                  },
              ],
          };

    const ignoreOn = raw.ignoreOn || {
        tax: false,
        discounts: false,
    };

    return {
        itemId: String(itemId),
        restaurantId: String(resId),
        name,
        description,
        price,
        imageUrl,
        foodType,
        gstType: raw.gstType || "services",
        category: categoryObj,
        billComponents,
        ignoreOn,
    };
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

        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                for (const it of sub.items || []) {
                    if (String(it.id) === String(itemId)) {
                        currentItem = it;
                        parentCat = cat;
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

        // 2. Build the payload according to Ownly's schema
        const payload = buildOwnlyItemPayload(resId, itemId, currentItem, parentCat, body);

        // 3. Send PUT request to Ownly live API
        const ownlyResponse = await ownlyClient({
            req,
            endpoint: "/api/v1/menu/item",
            method: "PUT",
            data: payload,
        });

        const resData = ownlyResponse.data;

        // 4. Update MongoDB item fields
        currentItem.name = payload.name;
        currentItem.description = payload.description;
        currentItem.price = payload.price;
        currentItem.base_price = payload.price;
        currentItem.imageUrl = payload.imageUrl;
        currentItem.image_url = payload.imageUrl;
        currentItem.is_veg = payload.foodType === "non-veg" ? "NON_VEG" : (payload.foodType === "egg" ? "EGG" : "VEG");

        if (payload.imageUrl) {
            currentItem.media = [
                {
                    url: payload.imageUrl,
                    thumbUrl: payload.imageUrl,
                    sourceUrl: body.sourceUrl || "",
                    isNewlyUploaded: true,
                },
            ];
        }

        if (currentItem.raw && typeof currentItem.raw === "object") {
            currentItem.raw.name = payload.name;
            currentItem.raw.description = payload.description;
            currentItem.raw.price = payload.price;
            currentItem.raw.imageUrl = payload.imageUrl;
            currentItem.raw.foodType = payload.foodType;
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

