import MenuSync from "@/model/menu-sync";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const pipeline = [];
    if (startDate && endDate) {
      pipeline.push({
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      });
    }

    console.log("Syncs API Date filter:", { startDate, endDate });
    const count = await MenuSync.countDocuments();
    const countToday = await MenuSync.countDocuments(pipeline[0]?.$match || {});
    console.log("Total syncs in DB:", count, "Today:", countToday);

    pipeline.push(
      {
        $lookup: {
          from: "restaurants",
          localField: "resId",
          foreignField: "resId",
          as: "restaurant"
        }
      },
      {
        $addFields: {
          restaurantName: { $arrayElemAt: ["$restaurant.name", 0] }
        }
      },
      {
        $project: {
          restaurant: 0,
          updated_menu: 0
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    );

    const syncs = await MenuSync.aggregate(pipeline);

    return NextResponse.json(
      {
        success: true,
        data: syncs,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Get syncs route error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Something went wrong",
      },
      { status: 500 }
    );
  }
}
