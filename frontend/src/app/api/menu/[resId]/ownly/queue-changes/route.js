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

        // In Ownly, categories and subcategories do not have separate delete endpoints.
        // Everything is handled by deleting items.
        // If any category or subcategory is marked for deletion, propagate action: "delete" to all items under it!
        const deletedCatIds = new Set(
            (updated_menu?.categories || [])
                .filter((c) => c.action === "delete")
                .map((c) => String(c.id))
        );

        const deletedSubIds = new Set(
            (updated_menu?.sub_categories || [])
                .filter((s) => s.action === "delete")
                .map((s) => String(s.id))
        );

        const currentItems = Array.isArray(updated_menu?.items) ? [...updated_menu.items] : [];

        if (menuDoc?.menu && (deletedCatIds.size > 0 || deletedSubIds.size > 0)) {
            for (const cat of menuDoc.menu) {
                const catIdStr = String(cat.id);
                const isCatDeleted = deletedCatIds.has(catIdStr);

                for (const sub of cat.sub_category || []) {
                    const subIdStr = String(sub.id);
                    const isSubDeleted = deletedSubIds.has(subIdStr);

                    if (isCatDeleted || isSubDeleted) {
                        for (const it of sub.items || []) {
                            const itIdStr = String(it.id);
                            if (itIdStr.startsWith("temp-") || itIdStr.startsWith("temp_")) {
                                continue;
                            }

                            const existingIdx = currentItems.findIndex(
                                (i) => String(i.id) === itIdStr
                            );
                            if (existingIdx >= 0) {
                                currentItems[existingIdx] = {
                                    ...currentItems[existingIdx],
                                    action: "delete",
                                    categoryId: cat.id,
                                    subCategoryId: sub.id,
                                };
                            } else {
                                currentItems.push({
                                    id: it.id,
                                    name: it.name,
                                    categoryId: cat.id,
                                    categoryName: cat.name,
                                    subCategoryId: sub.id,
                                    subCategoryName: sub.name,
                                    action: "delete",
                                });
                            }
                        }
                    }
                }
            }
        }

        const itemsWithStatus = currentItems.map((i) => {
            const finalPrice = Number(
                (i.base_price !== undefined && i.base_price !== null && i.base_price !== "")
                    ? i.base_price
                    : (i.price ?? 0)
            );
            return {
                ...i,
                price: finalPrice,
                base_price: finalPrice,
                min_price: finalPrice,
                max_price: finalPrice,
                status: i.status || "pending",
            };
        });

        const categoriesWithStatus = (updated_menu?.categories || []).map((c) => ({
            ...c,
            action: c.action || "create",
            status: c.status || "pending",
        }));

        const subCategoriesWithStatus = (updated_menu?.sub_categories || []).map((s) => ({
            ...s,
            action: s.action || "create",
            status: s.status || "pending",
        }));

        const finalUpdatedMenu = {
            categories: categoriesWithStatus,
            sub_categories: subCategoriesWithStatus,
            items: itemsWithStatus,
        };

        const sync = await MenuSync.create({
            resId,
            status: "pending",
            accountName: accountName || "Ownly Account",
            taskId: taskId || null,
            updated_menu: finalUpdatedMenu,
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

