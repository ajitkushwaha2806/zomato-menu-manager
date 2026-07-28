import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { validateRequiredFields } from "@/lib/payload/helper";

const REQUIRED_FIELDS = ["item_ids"];

export async function DELETE(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        validateRequiredFields(body, REQUIRED_FIELDS);

        const payload = {
            "item_ids": body.item_ids,
        };

        if (!Array.isArray(payload.item_ids)) {
            throw new Error("item_ids must be an array");
        }

        if (payload.item_ids.length === 0) {
            throw new Error("item_ids cannot be empty");
        }

        const response = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/${resId}`,
            method: "DELETE",
            data: payload,
        });

        return NextResponse.json({
            success: true,
            response,
            payload,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Something went wrong",
            },
            {
                status: 400,
            }
        );
    }
}