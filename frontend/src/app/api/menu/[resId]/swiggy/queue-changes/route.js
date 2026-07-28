import MenuSync from "@/model/menu-sync";
import { NextResponse } from "next/server";
import { swiggyProcessorJob } from "@/lib/bullmq/job/swiggy-processor";

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const accountName = req.headers.get("x-swiggy-account");

        if (!accountName) {
            return NextResponse.json(
                { success: false, message: "Swiggy account (x-swiggy-account header) is required" },
                { status: 400 }
            );
        }

        let { updated_menu } = body;

        if (!updated_menu) {
            const Menu = require('@/model/menu').default || require('@/model/menu');
            const menuDoc = await Menu.findOne({ resId, platform: 'swiggy' });
            if (!menuDoc || !menuDoc.menu) {
                return NextResponse.json(
                    { success: false, message: "Menu not found in database" },
                    { status: 404 }
                );
            }
            updated_menu = menuDoc.menu;
        }

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "resId is required",
                },
                { status: 400 }
            );
        }

        const sync = await MenuSync.create({
            resId,
            status: "pending",
            accountName,
            updated_menu,
        });

        console.log(sync);

        await swiggyProcessorJob({
            type: "menu_sync",
            resId,
            syncId: sync._id.toString(),
            accountName,
        });

        return NextResponse.json(
            {
                success: true,
                syncId: sync._id,
                message: "Menu sync queued",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.message ||
                    "Something went wrong",
            },
            { status: 500 }
        );
    }
}