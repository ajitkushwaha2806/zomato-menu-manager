import Menu from "@/model/menu"
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";

export async function GET(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        const payload = new URLSearchParams({
            "data[remove_item_ho_flag]": "1",
            "serving_type": "1",
            "data[current_restaurant]": resId,
            "data[Item][item_filter]": "",
            "search": "Search"
        });

        const result = await petpoojaClient({
            req,
            endpoint: `/menus/milistnew/${resId}`,
            method: "POST",
            contentType: "form",
            data: payload.toString()
        });

        return NextResponse.json(
            {
                success: true,
                message: "Menu fetched successfully",
                data: result,
            },
            { status: 200 }
        );
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                message: err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}