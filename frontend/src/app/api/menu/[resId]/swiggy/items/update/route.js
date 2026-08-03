import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { buildItemUpdatePayload } from "@/lib/payload/swiggy/add-items";

export async function POST(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        const itemId = body.item_id || body.id;
        let updates = body.updated_items || body;

        // Sanitize incoming updates payload to completely strip is_veg: "NONE" from variants
        if (updates.variants && Array.isArray(updates.variants)) {
            updates.variants = updates.variants.map(vg => ({
                ...vg,
                options: (vg.options || []).map(opt => {
                    const newOpt = { ...opt };
                    if (newOpt.is_veg === "NONE") {
                        delete newOpt.is_veg;
                    }
                    return newOpt;
                })
            }));
        }

        if (!itemId) {
            throw new Error("item_id or id is required");
        }

        const menuResp = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/restaurant-menu-wrapper/${resId}`,
            method: "GET",
            params: {
                disabled: true,
                item_slots: true,
                tickets: true,
            },
        });

        const items = menuResp?.data?.data?.menu?.items_vo || [];
        const item = items.find((item) => String(item?.item?.id) === String(itemId));

        if (!item) {
            throw new Error(`Item with id ${itemId} not found in restaurant menu`);
        }

        const updatePayload = buildItemUpdatePayload(item, updates);

        const updateResp = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/item/${resId}`,
            method: "POST",
            data: updatePayload,
        });

        return NextResponse.json({
            updatePayload,
            updateResp
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error.message,
            },
            {
                status: 400,
            }
        );
    }
}