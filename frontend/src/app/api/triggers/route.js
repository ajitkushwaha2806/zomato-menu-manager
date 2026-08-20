import dbConnect from "@/lib/dbConnect";
import Trigger from "@/model/trigger";
import { NextResponse } from "next/server";

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

        const triggers = await Trigger.find(query).sort({ createdAt: -1 });

        return NextResponse.json({ success: true, data: triggers });
    } catch (error) {
        console.error("Error fetching triggers:", error);
        return NextResponse.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
