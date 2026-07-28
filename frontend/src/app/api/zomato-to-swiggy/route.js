import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import MigrationRequest from "@/model/migration-request";

/**
 * GET /api/zomato-to-swiggy
 * Fetch all migration requests
 */
export async function GET() {
  try {
    await dbConnect();
    const requests = await MigrationRequest.find({}).sort({ createdAt: -1 });
    return NextResponse.json({
      success: true,
      data: requests,
    });
  } catch (err) {
    console.error("[zomato-to-swiggy GET] Error:", err);
    return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
  }
}

/**
 * POST /api/zomato-to-swiggy
 * Receives migration request details and persists them.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { zomatoResId, zomatoResName, swiggyResId, swiggyResName, zomatoAccess, swiggyAccess, priceHandling, priceRaw, submittedBy, remarks } = body;

    // Basic validation
    if (!zomatoResId || !swiggyResId) {
      return NextResponse.json({ success: false, message: "Both Zomato and Swiggy Res IDs are required." }, { status: 400 });
    }
    if (!zomatoResName || !swiggyResName) {
      return NextResponse.json({ success: false, message: "Both Zomato and Swiggy Restaurant Names are required." }, { status: 400 });
    }
    if (!submittedBy) {
      return NextResponse.json({ success: false, message: "Submitted By name is required." }, { status: 400 });
    }
    if (zomatoAccess === undefined || zomatoAccess === null) {
      return NextResponse.json({ success: false, message: "Zomato access status is required." }, { status: 400 });
    }
    if (swiggyAccess === undefined || swiggyAccess === null) {
      return NextResponse.json({ success: false, message: "Swiggy access status is required." }, { status: 400 });
    }
    if (!priceHandling || !priceRaw) {
      return NextResponse.json({ success: false, message: "Price handling value is required." }, { status: 400 });
    }

    await dbConnect();

    const newRequest = await MigrationRequest.create({
      zomatoResId,
      zomatoResName,
      swiggyResId,
      swiggyResName,
      zomatoAccess,
      swiggyAccess,
      priceHandling,
      priceRaw,
      submittedBy,
      remarks,
      status: "pending"
    });

    return NextResponse.json({
      success: true,
      message: "Migration request submitted successfully.",
      data: newRequest,
    });
  } catch (err) {
    console.error("[zomato-to-swiggy POST] Error:", err);
    return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
  }
}
