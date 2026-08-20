import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { validateRequiredFields } from "@/lib/payload/helper";
import { buildItemPayload } from "@/lib/payload/swiggy/add-items";

const REQUIRED_FIELDS = [
    "name",
    "base_price",
    "categoryId",
    "categoryName",
    "subCategoryId",
    "subCategoryName",
    "is_veg",
    "description"
];

export async function POST(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        console.log("BOdy", body)
        validateRequiredFields(body, REQUIRED_FIELDS);

        const payload = buildItemPayload(body);
        console.log("Payload", payload)
        const response = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/item/${resId}`,
            method: "POST",
            data: payload,
        });

        console.log("Response", JSON.stringify(response, null, 2));

        return NextResponse.json({
            response,
            payload
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