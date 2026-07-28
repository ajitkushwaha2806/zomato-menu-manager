import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const searchParams = request.nextUrl.searchParams;
        const platform = searchParams.get('platform');

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        const query = { resId };
        if (platform) {
            query.platform = platform;
        }

        const menuData = await Menu.findOne(query);
        if (!menuData) {
            const newMenu = await Menu.create({
                resId,
                platform: platform || "zomato",
                menu: [],
            });
            return NextResponse.json(
                {
                    data: newMenu
                },
                { status: 201 }
            );
        }

        return NextResponse.json({
            success: true,
            data: menuData
        });
    } catch (error) {
        console.error("Menu Fetch Error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message || "Failed to fetch menu",
            },
            { status: 500 }
        );
    }
}

export async function PUT(req, { params }) {
    try {
        await dbConnect()
        const { resId } = await params;
        const body = await req.json();
        const platform = req.nextUrl.searchParams.get("platform") || "zomato"; // Align default with GET

        const { menu, addons } = body;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        if (!menu) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu is required",
                },
                { status: 400 }
            );
        }

        let existingMenu = await Menu.findOne({
            resId,
            platform,
        });

        if (!existingMenu) {
            // Create one if it doesn't exist for this platform
            existingMenu = await Menu.create({
                resId,
                platform,
                menu: []
            });
        }

        existingMenu.menu = menu;
        if (addons !== undefined) {
            existingMenu.addons = addons;
        }
        await existingMenu.save();
        
        return NextResponse.json({
            success: true,
            message: "Menu updated successfully",
            data: existingMenu.menu,
        });
    } catch (error) {
        console.error("Menu Update Error:", error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message || "Failed to update menu",
            },
            { status: 500 }
        );
    }
}