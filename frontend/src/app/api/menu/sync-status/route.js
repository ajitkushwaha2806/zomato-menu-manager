import { NextResponse } from "next/server";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";

export const dynamic = "force-dynamic";

export async function GET(req) {
    try {
        await dbConnect();
        // Light projection for instant response without transferring 70MB of menus
        const menus = await Menu.find(
            {},
            { resId: 1, platform: 1, name: 1, updatedAt: 1 }
        ).sort({ updatedAt: -1 }).lean();

        const summary = menus.map((m) => ({
            resId: m.resId,
            platform: m.platform || "zomato",
            name: m.name || "",
            updatedAt: m.updatedAt,
        }));

        return NextResponse.json({
            success: true,
            totalRestaurantsInDb: summary.length,
            restaurants: summary,
        });
    } catch (err) {
        console.error("Sync status route error:", err);
        return NextResponse.json(
            { success: false, message: err.message || "Failed to fetch sync status" },
            { status: 500 }
        );
    }
}
