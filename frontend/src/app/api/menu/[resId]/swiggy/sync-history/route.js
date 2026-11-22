import MenuSync from "@/model/menu-sync";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

export async function GET(req, { params }) {
    try {
        await dbConnect();

        const { resId } = await params;
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "20", 10);

        if (!resId) {
            return NextResponse.json(
                { success: false, message: "resId is required" },
                { status: 400 }
            );
        }

        const history = await MenuSync.find({ resId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return NextResponse.json(
            {
                success: true,
                data: history,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Error fetching sync history:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Something went wrong",
            },
            { status: 500 }
        );
    }
}

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const { syncId, action } = await req.json();

        if (!syncId) {
            return NextResponse.json(
                { success: false, message: "syncId is required" },
                { status: 400 }
            );
        }

        if (action === "cancel") {
            await MenuSync.updateOne(
                { _id: syncId },
                { $set: { status: "completed_with_errors" } }
            );
            return NextResponse.json({
                success: true,
                message: "Sync job cancelled and marked completed with errors.",
            });
        }

        return NextResponse.json(
            { success: false, message: "Unknown action" },
            { status: 400 }
        );
    } catch (error) {
        console.error("Error updating Swiggy sync status:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to update sync status" },
            { status: 500 }
        );
    }
}
