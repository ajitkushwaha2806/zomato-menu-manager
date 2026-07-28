import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import MigrationRequest from "@/model/migration-request";

export async function GET(req, { params }) {
  try {
    const { requestId } = await params;
    if (!requestId) return NextResponse.json({ success: false, message: "Request ID required" }, { status: 400 });

    await dbConnect();
    const migrationRequest = await MigrationRequest.findById(requestId);
    if (!migrationRequest) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: migrationRequest });
  } catch (err) {
    console.error("[zomato-to-swiggy GET by id] Error:", err);
    return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const { requestId } = await params;
    if (!requestId) return NextResponse.json({ success: false, message: "Request ID required" }, { status: 400 });

    const body = await req.json();
    const { status, currentStep } = body;

    const updateFields = {};
    if (status) updateFields.status = status;
    if (currentStep) updateFields.currentStep = currentStep;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ success: false, message: "No update fields provided" }, { status: 400 });
    }

    await dbConnect();
    const updatedRequest = await MigrationRequest.findByIdAndUpdate(
      requestId,
      updateFields,
      { new: true }
    );

    if (!updatedRequest) return NextResponse.json({ success: false, message: "Request not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: updatedRequest });
  } catch (err) {
    console.error("[zomato-to-swiggy PATCH by id] Error:", err);
    return NextResponse.json({ success: false, message: "Internal server error." }, { status: 500 });
  }
}
