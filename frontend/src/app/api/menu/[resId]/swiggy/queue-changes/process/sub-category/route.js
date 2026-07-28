import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import MenuSync from "@/model/menu-sync";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";
import { swiggyProcessorJob } from "@/lib/bullmq/job/swiggy-processor";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const body = await req.json();

        const {
            syncId,
            action,
            payload,
        } = body;

        const accountName = req.headers.get("x-swiggy-account");

        const sync = await MenuSync.findById(syncId);

        console.log(syncId, action, payload)

        if (!sync) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Sync not found",
                },
                { status: 404 }
            );
        }

        let method = "post";

        const api =
            `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/sub-category`;

        switch (action) {
            case "create":
                method = "post";
                break;

            case "update":
                method = "put";
                break;

            case "delete":
                method = "delete";
                break;

            default:
                return NextResponse.json(
                    {
                        success: false,
                        message: `Invalid action '${action}'`,
                    },
                    { status: 400 }
                );
        }

        let data = null;
        let apiError = null;

        try {
            const response = await axios({
                method,
                url: api,
                data: payload,
                timeout: 30000,
                headers: {
                    "x-swiggy-account": accountName || "",
                    "Content-Type": "application/json",
                },
            });
            data = response.data;
        } catch (err) {
            apiError = err;
            data = err.response?.data || null;
            console.error(`Swiggy API Error in sub-category sync for action ${action}:`, err.message);
        }

        if (action === "create") {
            const swiggySubCategoryId = data?.data?.id || data?.response?.data?.data?.id;
            const tempId = payload?.id;

            if (!swiggySubCategoryId || !tempId || apiError) {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "SubCategory sync failed";
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.sub_categories.$.status": "failed",
                            "updated_menu.sub_categories.$.error": errorMsg
                        }
                    }
                );
            } else {
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.sub_categories.$.id": swiggySubCategoryId,
                            "updated_menu.sub_categories.$.status": "completed",
                            "updated_menu.sub_categories.$.error": null
                        }
                    }
                );

                await MenuSync.updateMany(
                    { _id: syncId },
                    {
                        $set: {
                            "updated_menu.items.$[elem].subCategoryId": swiggySubCategoryId
                        }
                    },
                    {
                        arrayFilters: [{ "elem.subCategoryId": tempId }]
                    }
                );

                // ─── Update main Menu document ────────────────────────────────
                const menuDoc = await Menu.findOne({ resId, platform: "swiggy" });
                if (menuDoc && Array.isArray(menuDoc.menu)) {
                    let changed = false;
                    menuDoc.menu = menuDoc.menu.map(cat => ({
                        ...cat,
                        sub_category: (cat.sub_category || []).map(sub => {
                            if (String(sub.id) === String(tempId)) {
                                changed = true;
                                return { ...sub, id: swiggySubCategoryId };
                            }
                            return sub;
                        })
                    }));
                    if (changed) {
                        menuDoc.markModified("menu");
                        await menuDoc.save();
                        console.log(`[${syncId}] ✅ Menu doc updated: temp sub ${tempId} → ${swiggySubCategoryId}`);
                    }
                }
                // ─────────────────────────────────────────────────────────────
            }
        }

        if (action === "update") {
            if (apiError || data?.response?.data?.statusCode === -1 || data?.response?.data?.statusMessage === "FAILURE") {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "SubCategory update failed";
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.sub_categories.$.status": "failed",
                            "updated_menu.sub_categories.$.error": errorMsg
                        }
                    }
                );
            } else {
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.sub_categories.$.status": "completed",
                            "updated_menu.sub_categories.$.error": null
                        }
                    }
                );
            }
        }

        if (action === "delete") {
            if (apiError) {
                if (payload.sub_category_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.sub_categories.$[elem].status": "failed",
                                "updated_menu.sub_categories.$[elem].error": apiError.message || "Delete failed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.sub_category_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                        {
                            $set: {
                                "updated_menu.sub_categories.$.status": "failed",
                                "updated_menu.sub_categories.$.error": apiError.message || "Delete failed"
                            }
                        }
                    );
                }
            } else {
                if (payload.sub_category_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.sub_categories.$[elem].status": "completed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.sub_category_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.sub_categories.id": payload.id },
                        {
                            $set: {
                                "updated_menu.sub_categories.$.status": "completed"
                            }
                        }
                    );
                }
            }
        }

        const freshSync = await MenuSync.findById(syncId);
        const freshSubCategories = freshSync?.updated_menu?.sub_categories || [];
        const pendingSubCategories = freshSubCategories.filter((sub) => sub.status !== "completed" && sub.status !== "failed");

        if (
            pendingSubCategories.length === 0
        ) {
            console.log(
                `All subcategories completed for sync ${syncId}`
            );

            const updated = await MenuSync.findOneAndUpdate(
                { _id: syncId, "updated_menu.subcategories_queued": { $ne: true } },
                { $set: { "updated_menu.subcategories_queued": true } }
            );

            if (updated) {
                await swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "item_sync",
                    accountName: freshSync?.accountName,
                });
            }
        }

        return NextResponse.json(
            {
                success: true,
                syncId,
                action,
                pendingSubCategories:
                    pendingSubCategories.length,
                data,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.response?.data
                        ?.message ||
                    error?.message ||
                    "Something went wrong",
            },
            { status: 500 }
        );
    }
}