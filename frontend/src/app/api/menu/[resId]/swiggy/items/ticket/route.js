import { NextResponse } from "next/server";
import { SwiggyClient } from "@/lib/api/swiggy-client";
import { validateRequiredFields } from "@/lib/payload/helper";

export async function GET(request, { params }) {
    try {
        const { resId } = await params;

        const searchParams = request.nextUrl.searchParams;

        const action = searchParams.get("action");
        const next_page_token = searchParams.get("next_page_token");
        const rows_per_page = searchParams.get("rows_per_page");

        validateRequiredFields(
            { action },
            ["action"]
        );

        const query = new URLSearchParams({
            action,
            days: "90",
            rows_per_page: 5,
            sort: "false",
        });

        if (next_page_token) {
            query.append("next_page_token", next_page_token);
        }

        if (rows_per_page) {
            query.append("rows_per_page", rows_per_page);
        }

        console.log("api", `/api/cms/menu-revision/v1/ticket-list-for-restaurant/${resId}?${query.toString()}`)
        const ticketResponse = await SwiggyClient({
            req: request,
            endpoint: `/api/cms/menu-revision/v1/ticket-list-for-restaurant/${resId}?${query.toString()}`,
            method: "GET",
        });

        const result = ticketResponse?.data?.data || []


        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(error);

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