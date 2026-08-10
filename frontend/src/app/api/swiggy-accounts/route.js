import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import SwiggyCredential from "@/model/swiggyCredential";

export async function GET(req) {
    try {
        await dbConnect();
        // Don't return passwords to frontend
        const accounts = await SwiggyCredential.find().select("-password").sort({ createdAt: -1 });
        return NextResponse.json({ success: true, accounts });
    } catch (error) {
        console.error("Error fetching swiggy accounts:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        await dbConnect();
        const { name, username, password } = await req.json();

        if (!name || !username || !password) {
            return NextResponse.json({ success: false, message: "Name, username, and password are required." }, { status: 400 });
        }

        const account = await SwiggyCredential.findOneAndUpdate(
            { name },
            { name, username, password },
            { new: true, upsert: true }
        );

        const { password: _, ...safeAccount } = account.toObject();

        return NextResponse.json({ success: true, account: safeAccount });
    } catch (error) {
        console.error("Error saving swiggy account:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        await dbConnect();
        const { searchParams } = new URL(req.url);
        const name = searchParams.get("name");

        if (!name) {
            return NextResponse.json({ success: false, message: "Name parameter is required." }, { status: 400 });
        }

        await SwiggyCredential.findOneAndDelete({ name });
        return NextResponse.json({ success: true, message: "Swiggy account deleted." });
    } catch (error) {
        console.error("Error deleting swiggy account:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
