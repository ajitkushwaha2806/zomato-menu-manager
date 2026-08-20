import OutletTransfer from "@/model/outletTransfer";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    await dbConnect();
    const body = await req.json();

    const { fromResId, fromResName, toResId, toResName, platform, details } = body;

    if (!fromResId || !fromResName || !toResId || !toResName) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields: fromResId, fromResName, toResId, toResName",
        },
        { status: 400 }
      );
    }

    const newTransfer = new OutletTransfer({
      fromResId,
      fromResName,
      toResId,
      toResName,
      platform: platform || "zomato",
      details: details || {},
    });

    await newTransfer.save();

    return NextResponse.json(
      {
        success: true,
        data: newTransfer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create transfer route error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit")) || 50;
    const skip = parseInt(url.searchParams.get("skip")) || 0;
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    let query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transfers = await OutletTransfer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await OutletTransfer.countDocuments(query);

    return NextResponse.json(
      {
        success: true,
        data: transfers,
        total,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get transfers route error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}
