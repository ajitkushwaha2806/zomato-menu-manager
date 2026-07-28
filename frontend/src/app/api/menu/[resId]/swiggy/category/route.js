import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { validateRequiredFields } from "@/lib/payload/helper";

const CATEGORY_POST_REQUIRED_FIELDS = ["name"];
const CATEGORY_DELETE_REQUIRED_FIELDS = ["category_ids"];
const CATEGORY_UPDATE_REQUIRED_FIELDS = ["name", "id"];

export async function POST(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        validateRequiredFields(body, CATEGORY_POST_REQUIRED_FIELDS);

        const payload = {
            "name": body.name,
            "type": "Cat",
            "insightMappings": body.insightMappings || null,
        }

        const response = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/${resId}/category`,
            method: "POST",
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

export async function DELETE(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        validateRequiredFields(body, CATEGORY_DELETE_REQUIRED_FIELDS);

        const payload = {
            "category_ids": body.category_ids,
        }

        if (!Array.isArray(payload.category_ids)) {
            throw new Error("category_ids must be an array");
        }

        if (payload.category_ids.length === 0) {
            throw new Error("category_ids cannot be empty");
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

export async function PUT(request, { params }) {
    try {
        const { resId } = await params;
        const body = await request.json();

        validateRequiredFields(body, CATEGORY_UPDATE_REQUIRED_FIELDS);

        const payload = {
            "category_name": body.name,
            "type": "Cat",
        }

        console.log("payload", payload)
        const response = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/${resId}/category/${body?.id}`,
            method: "PUT",
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