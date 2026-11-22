import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";

export const dynamic = "force-dynamic";

/**
 * Helper to delete a single item from Ownly live API and MongoDB
 */
async function deleteSingleOwnlyItem(resId, itemId, req, accountName, categoryId = null, subcategoryId = null) {
    await dbConnect();
    const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });

    // Look up category and subcategory from MongoDB if not provided
    let targetCatId = categoryId;
    let targetSubId = subcategoryId;

    if (menuDoc?.menu) {
        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                for (const it of sub.items || []) {
                    if (String(it.id) === String(itemId)) {
                        if (!targetCatId) targetCatId = cat.id;
                        if (!targetSubId) targetSubId = sub.id;
                        break;
                    }
                }
                if (targetCatId) break;
            }
            if (targetCatId) break;
        }
    }

    // If item is only local/temporary, skip hitting Ownly API
    const isTemp = String(itemId).startsWith("temp-") || String(itemId).startsWith("temp_");

    let apiResponse = null;
    if (!isTemp) {
        const payload = {
            restaurantId: String(resId),
            categoryId: String(targetCatId || `CAT_${resId}`),
            subcategoryId: (targetSubId && !String(targetSubId).startsWith("sub-") && !String(targetSubId).startsWith("temp"))
                ? String(targetSubId)
                : null,
            itemId: String(itemId),
        };

        console.log(`[Ownly Item Delete] Calling DELETE /api/v1/menu/item for item ${itemId}:`, payload);

        const ownlyRes = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/menu/item",
            method: "DELETE",
            data: payload,
        });
        apiResponse = ownlyRes.data;
    }

    // Remove item from MongoDB menu
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

    return apiResponse;
}

/**
 * POST & DELETE /api/menu/[resId]/ownly/items/delete
 * Matches Swiggy CRUD pattern for item deletion
 */
export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const accountName = body.accountName || req.headers.get("x-ownly-account") || req.headers.get("x-ownly-cookie");

        const itemIds = Array.isArray(body.item_ids)
            ? body.item_ids
            : [body.itemId || body.id].filter(Boolean);

        if (itemIds.length === 0) {
            return NextResponse.json(
                { success: false, message: "itemId or item_ids array is required." },
                { status: 400 }
            );
        }

        const results = [];
        for (const id of itemIds) {
            const resData = await deleteSingleOwnlyItem(
                resId,
                id,
                req,
                accountName,
                body.categoryId,
                body.subcategoryId
            );
            results.push({ itemId: id, success: true, data: resData });
        }

        return NextResponse.json({
            success: true,
            message: `Successfully deleted ${results.length} item(s) from Ownly`,
            results,
        });
    } catch (err) {
        console.error("Ownly Delete Item API Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to delete item from Ownly",
            },
            { status: err.response?.status || 500 }
        );
    }
}

export async function DELETE(req, context) {
    return POST(req, context);
}
