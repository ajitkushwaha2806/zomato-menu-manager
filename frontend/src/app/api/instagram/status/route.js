import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import InstagramAccount from "@/model/instagramAccount";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        await dbConnect();

        const account = await InstagramAccount.findOne({ isActive: true }).sort({ updatedAt: -1 });

        if (!account) {
            return NextResponse.json({
                success: true,
                isConnected: false,
                username: null,
            });
        }

        const isExpired = account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date();

        return NextResponse.json({
            success: true,
            isConnected: !isExpired,
            isExpired,
            username: account.username,
            connectedAt: account.connectedAt,
            tokenExpiresAt: account.tokenExpiresAt,
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}

