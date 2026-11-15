import MenuSync from "@/model/menu-sync";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get("limit") || "20", 10);

        if (!resId) {
            return NextResponse.json(
                { success: false, message: "resId is required." },
                { status: 400 }
            );
        }

        const history = await MenuSync.find({ resId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return NextResponse.json({
            success: true,
            data: history,
        });
    } catch (error) {
        console.error("Error fetching Ownly sync history:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to fetch sync history" },
            { status: 500 }
        );
    }
}

