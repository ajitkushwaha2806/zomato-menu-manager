import MenuSync from "@/model/menu-sync";
import Trigger from "@/model/trigger";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { ownlyProcessorJob } from "@/lib/bullmq/job/ownly-processor";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const body = await req.json();
        const accountName = body.accountName || req.headers.get("x-ownly-account") || req.headers.get("x-ownly-cookie");

        if (!resId) {
            return NextResponse.json(
                { success: false, message: "resId is required." },
                { status: 400 }
            );
        }

        let { updated_menu, taskId } = body;

        if (taskId) {
            await Menu.findOneAndUpdate(
                { resId, platform: "ownly" },
                { $set: { taskId } },
                { upsert: true }
            );
        }

        const menuDoc = await Menu.findOne({ resId, platform: "ownly" });

        if (!updated_menu) {
            if (!menuDoc || !menuDoc.menu) {
                return NextResponse.json(
                    { success: false, message: "Menu not found in database." },
                    { status: 404 }
                );
            }
            updated_menu = { items: [] };
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
                    await Menu.updateOne(
                        { _id: menuDoc._id },
                        { $set: { menu: newMenuData } }
                    );
                } else {
                    await Menu.create({
                        resId,
                        platform: "ownly",
                        menu: newMenuData,
                    });
                }
            }
        }

        const sync = await MenuSync.create({
            resId,
            status: "pending",
            accountName: accountName || "Ownly Account",
            taskId: taskId || null,
            updated_menu: updated_menu || { items: [] },
        });

        if (taskId) {
            try {
                await Trigger.create({
                    resId: String(resId),
                    platform: "ownly",
                    taskId,
                    status: "SUCCESS",
                });
            } catch (tErr) {
                console.warn("Could not log trigger:", tErr.message);
            }
        }

        console.log(`[Ownly Queue] Created MenuSync ${sync._id} for resId ${resId}`);

        await ownlyProcessorJob({
            type: "menu_sync",
            resId,
            syncId: sync._id.toString(),
            accountName,
        });

        return NextResponse.json(
            {
                success: true,
                syncId: sync._id,
                message: "Ownly menu update queued successfully",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("Ownly queue-changes error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to queue Ownly changes",
            },
            { status: 500 }
        );
    }
}

