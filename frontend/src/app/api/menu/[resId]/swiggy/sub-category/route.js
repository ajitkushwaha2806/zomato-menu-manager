import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { validateRequiredFields } from "@/lib/payload/helper";

const SUB_CATEGORY_POST_REQUIRED_FIELDS = ["name", "categoryId"];
const SUB_CATEGORY_DELETE_REQUIRED_FIELDS = ["sub_category_ids"];
const SUB_CATEGORY_UPDATE_REQUIRED_FIELDS = ["name", "categoryId"];

export async function POST(request, { params }) {
    try {
        console.log("Add New Category")
        const { resId } = await params;
        const body = await request.json();

        validateRequiredFields(body, SUB_CATEGORY_POST_REQUIRED_FIELDS);

        const payload = {
            "name": body.name,
            "type": "SubCat",
            "parentCategoryId": body.categoryId,
            "insightMappings": body.insightMappings,
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

        validateRequiredFields(body, SUB_CATEGORY_DELETE_REQUIRED_FIELDS);

        const payload = {
            "sub_category_ids": body.sub_category_ids,
        }

        if (!Array.isArray(payload.sub_category_ids)) {
            throw new Error("sub_category_ids must be an array");
        }

        if (payload.sub_category_ids.length === 0) {
            throw new Error("sub_category_ids cannot be empty");
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

        validateRequiredFields(body, SUB_CATEGORY_UPDATE_REQUIRED_FIELDS);

        const payload = {
            "category_name": body.name,
            "type": "SubCat",
        }

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