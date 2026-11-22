import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import InstagramAccount from "@/model/instagramAccount";

export const dynamic = "force-dynamic";

export async function DELETE() {
    try {
        await dbConnect();
        await InstagramAccount.updateMany({}, { $set: { isActive: false } });

        return NextResponse.json({
            success: true,
            message: "Instagram account disconnected successfully",
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

