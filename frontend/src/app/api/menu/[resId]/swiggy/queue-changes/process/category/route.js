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
            `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/category`;

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
            console.error(`Swiggy API Error in category sync for action ${action}:`, err.message);
        }

        const categories =
            sync.updated_menu?.categories || [];

        const category = categories.find(
            (cat) =>
                cat.id === payload.id
        );

        if (!category) {
            console.warn(
                `Category not found in sync for payload`,
                payload
            );
        }

        if (action === "create") {
            const swiggyCategoryId = data?.data?.id || data?.response?.data?.data?.id || data?.response?.data?.id;
            const tempId = payload?.id;

            if (!swiggyCategoryId || !tempId || apiError) {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "Category sync failed";
                console.error(`Category create failed. tempId: ${tempId}, Error: ${errorMsg}`);
                
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.categories.$.status": "failed",
                            "updated_menu.categories.$.error": errorMsg
                        }
                    }
                );
            } else {
                // Update MenuSync doc — replace temp ID with real Swiggy ID
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.categories.$.id": swiggyCategoryId,
                            "updated_menu.categories.$.status": "completed",
                            "updated_menu.categories.$.error": null
                        }
                    }
                );

                // Safely update all related sub_categories using atomic arrayFilters
                await MenuSync.updateMany(
                    { _id: syncId },
                    {
                        $set: {
                            "updated_menu.sub_categories.$[elem].categoryId": swiggyCategoryId
                        }
                    },
                    {
                        arrayFilters: [{ "elem.categoryId": tempId }]
                    }
                );

                // Safely update all related items using atomic arrayFilters
                await MenuSync.updateMany(
                    { _id: syncId },
                    {
                        $set: {
                            "updated_menu.items.$[elem].categoryId": swiggyCategoryId
                        }
                    },
                    {
                        arrayFilters: [{ "elem.categoryId": tempId }]
                    }
                );

                // ─── Update main Menu document ────────────────────────────────
                // Replace temp- category ID with real Swiggy ID in the stored menu
                const menuDoc = await Menu.findOne({ resId, platform: "swiggy" });
                if (menuDoc && Array.isArray(menuDoc.menu)) {
                    let changed = false;
                    menuDoc.menu = menuDoc.menu.map(cat => {
                        if (String(cat.id) === String(tempId)) {
                            changed = true;
                            return { ...cat, id: swiggyCategoryId };
                        }
                        // Also fix sub_category references
                        const updatedSubs = (cat.sub_category || []).map(sub => {
                            if (String(sub.categoryId) === String(tempId)) {
                                return { ...sub, categoryId: swiggyCategoryId };
                            }
                            return sub;
                        });
                        return { ...cat, sub_category: updatedSubs };
                    });
                    if (changed) {
                        menuDoc.markModified("menu");
                        await menuDoc.save();
                        console.log(`[${syncId}] ✅ Menu doc updated: temp ${tempId} → ${swiggyCategoryId}`);
                    }
                }
                // ─────────────────────────────────────────────────────────────
            }
        }

        if (action === "update") {
            if (apiError || data?.response?.data?.statusCode === -1 || data?.response?.data?.statusMessage === "FAILURE") {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "Category update failed";
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.categories.$.status": "failed",
                            "updated_menu.categories.$.error": errorMsg
                        }
                    }
                );
            } else {
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.categories.id": payload.id },
                    {
                        $set: {
                            "updated_menu.categories.$.status": "completed",
                            "updated_menu.categories.$.error": null
                        }
                    }
                );
            }
        }

        if (action === "delete") {
            if (apiError) {
                if (payload.category_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.categories.$[elem].status": "failed",
                                "updated_menu.categories.$[elem].error": apiError.message || "Delete failed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.category_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.categories.id": payload.id },
                        {
                            $set: {
                                "updated_menu.categories.$.status": "failed",
                                "updated_menu.categories.$.error": apiError.message || "Delete failed"
                            }
                        }
                    );
                }
            } else {
                if (payload.category_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.categories.$[elem].status": "completed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.category_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.categories.id": payload.id },
                        {
                            $set: {
                                "updated_menu.categories.$.status": "completed"
                            }
                        }
                    );
                }
            }
        }

        // Fetch the freshed document to check if all categories are completed
        const freshSync = await MenuSync.findById(syncId);
        const pendingCategories = freshSync?.updated_menu?.categories?.filter((cat) => ["create", "update", "delete"].includes(cat.action) && cat.status !== "completed" && cat.status !== "failed") || [];

        if (pendingCategories.length === 0) {
            console.log(
                `All categories completed for sync ${syncId}`
            );

            const updated = await MenuSync.findOneAndUpdate(
                { _id: syncId, "updated_menu.categories_queued": { $ne: true } },
                { $set: { "updated_menu.categories_queued": true } }
            );

            if (updated) {
                await swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "sub_category_sync",
                    accountName: freshSync?.accountName,
                });
            }
        }

        return NextResponse.json(
            {
                success: true,
                syncId,
                action,
                pendingCategories:
                    pendingCategories.length,
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
                    error?.response?.data?.message ||
                    error?.message ||
                    "Something went wrong",
            },
            { status: 500 }
        );
    }
}