import OutletTransfer from "@/model/outletTransfer";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

export async function GET(req, { params }) {
  try {
    await dbConnect();
    const { resId } = await params;

    if (!resId) {
      return NextResponse.json(
        { success: false, message: "resId is required" },
        { status: 400 }
      );
    }

    // Fetch transfers where the restaurant is either the source or destination
    const transfers = await OutletTransfer.find({
      $or: [{ fromResId: resId }, { toResId: resId }]
    }).sort({ createdAt: -1 });

    return NextResponse.json(
      {
        success: true,
        data: transfers,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get transfers by resId route error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}
