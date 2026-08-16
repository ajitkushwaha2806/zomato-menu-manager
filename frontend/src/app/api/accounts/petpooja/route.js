import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import PetpoojaAccount from "@/model/petpoojaAccount.js";

export async function GET() {
  try {
    await dbConnect();
    const accounts = await PetpoojaAccount.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, accounts });
  } catch (error) {
    console.error("Error fetching petpooja accounts:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await dbConnect();
    const { name, cookie } = await req.json();

    if (!name || !cookie) {
      return NextResponse.json({ success: false, message: "Name and cookie are required." }, { status: 400 });
    }

    const account = await PetpoojaAccount.findOneAndUpdate(
      { name },
      { name, cookie },
      { new: true, upsert: true }
    );

    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error("Error saving petpooja account:", error);
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

    await PetpoojaAccount.findOneAndDelete({ name });
    return NextResponse.json({ success: true, message: "Petpooja account deleted." });
  } catch (error) {
    console.error("Error deleting petpooja account:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
