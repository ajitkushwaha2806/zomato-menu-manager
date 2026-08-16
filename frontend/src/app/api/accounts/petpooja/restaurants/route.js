import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";

export async function GET(req) {
    try {
        await dbConnect();
        
        // Find all restaurants where platform is petpooja (user added them to the Menu collection)
        const restaurants = await Menu.find({ platform: "petpooja" }).lean();
        
        const entities = restaurants.map(r => ({
            id: r.resId,
            name: r.name || "Unknown Petpooja Outlet",
            subzone: "Petpooja Database",
            thumbnail: null,
            platform: "petpooja",
            raw: r,
        }));

        return NextResponse.json({
            success: true,
            entities: entities,
            data: { data: entities } // For consistency if any client code expects this structure
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            {
                success: false,
                message: err?.message ?? "Internal Server Error",
            },
            { status: 500 }
        );
    }
}
