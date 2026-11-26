import MenuSync from "@/model/menu-sync";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { batchResolveRestaurantNames } from "@/lib/restaurantResolver";

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
          lookupRestaurantName: { $arrayElemAt: ["$restaurant.name", 0] }
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

    const rawSyncs = await MenuSync.aggregate(pipeline);

    // Resolve missing restaurant names
    const missingResIds = rawSyncs
      .filter((s) => !s.restaurantName && !s.lookupRestaurantName)
      .map((s) => s.resId);

    const nameMap = await batchResolveRestaurantNames(missingResIds);

    const syncs = rawSyncs.map((s) => ({
      ...s,
      restaurantName: s.restaurantName || s.lookupRestaurantName || nameMap[s.resId] || `Outlet ${s.resId}`,
    }));

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
