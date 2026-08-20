import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const body = await req.json();
        const { taskId, platform } = body;

        if (!taskId) {
            return NextResponse.json({ success: false, message: "Task ID is required" }, { status: 400 });
        }

        // Validate that taskId is a valid 24-character hex string (MongoDB ObjectId format)
        if (!/^[0-9a-fA-F]{24}$/.test(taskId)) {
            return NextResponse.json({ success: false, message: "Wrong TaskId . Enter correct task id only . " }, { status: 400 });
        }

        const activePlatform = platform || "zomato";

        await Menu.findOneAndUpdate(
            { resId, platform: activePlatform },
            { $set: { taskId } },
            { upsert: true, new: true }
        );

        return NextResponse.json({ success: true, message: "Task ID saved successfully", data: { taskId } });
    } catch (err) {
        if (err.code === 11000) {
            return NextResponse.json({ success: false, message: "Wrong TaskId . Enter correct task id only ." }, { status: 400 });
        }
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
