import dbConnect from "@/lib/dbConnect";
import Trigger from "@/model/trigger";
import { NextResponse } from "next/server";
import { batchResolveRestaurantNames } from "@/lib/restaurantResolver";

export async function GET(req) {
    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        let query = {};

        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
            };
        }

        const rawTriggers = await Trigger.find(query).sort({ createdAt: -1 }).lean();

        // Batch resolve restaurant names for any missing or empty ones
        const missingResIds = rawTriggers
            .filter((t) => !t.restaurantName || t.restaurantName.trim() === "" || t.restaurantName.startsWith("Outlet "))
            .map((t) => t.resId);

        const nameMap = await batchResolveRestaurantNames(missingResIds);

        const triggers = rawTriggers.map((t) => ({
            ...t,
            restaurantName: t.restaurantName && !t.restaurantName.startsWith("Outlet ")
                ? t.restaurantName
                : (nameMap[t.resId] || t.restaurantName || `Outlet ${t.resId}`),
        }));

        return NextResponse.json({ success: true, data: triggers });
    } catch (error) {
        console.error("Error fetching triggers:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
