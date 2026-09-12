import MenuSync from "@/model/menu-sync";
import Trigger from "@/model/trigger";
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

        let { updated_menu, taskId } = body;

        const Menu = require('@/model/menu').default || require('@/model/menu');
        if (taskId) {
            await Menu.findOneAndUpdate(
                { resId, platform: 'swiggy' },
                { $set: { taskId } },
                { upsert: true }
            );
        }
        
        const menuDoc = await Menu.findOne({ resId, platform: 'swiggy' });

        if (!updated_menu) {
            if (!menuDoc || !menuDoc.menu) {
                return NextResponse.json(
                    { success: false, message: "Menu not found in database" },
                    { status: 404 }
                );
            }
            updated_menu = menuDoc.menu;
        } else if (Array.isArray(updated_menu.categories) && updated_menu.categories.length > 0) {
            const newMenuData = updated_menu.categories.map((cat) => {
                const catSubs = (updated_menu.sub_categories || []).filter(
                    (s) => String(s.categoryId) === String(cat.id)
                );
                return {
                    id: cat.id,
                    name: cat.name,
                    sub_category: catSubs.map((sub) => {
                        const subItems = (updated_menu.items || []).filter(
                            (i) => String(i.subCategoryId) === String(sub.id)
                        );
                        return {
                            id: sub.id,
                            categoryId: cat.id,
                            name: sub.name,
                            items: subItems.map((item) => {
                                const { action, status, error, ...cleanItem } = item;
                                return cleanItem;
                            }),
                        };
                    }),
                };
            });

            if (newMenuData.length > 0) {
                if (menuDoc) {
                    menuDoc.menu = newMenuData;
                    menuDoc.markModified("menu");
                    await menuDoc.save();
                } else {
                    await Menu.create({
                        resId,
                        platform: "swiggy",
                        menu: newMenuData,
                    });
                }
            }
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
            taskId,
            updated_menu,
        });

        if (taskId) {
            await Trigger.create({ resId: String(resId), platform: "swiggy", taskId, status: "SUCCESS" });
        }

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
        if (body?.taskId) {
            await Trigger.create({ resId: String((await params).resId), platform: "swiggy", taskId: body.taskId, status: "FAILED", error: error.message });
        }

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