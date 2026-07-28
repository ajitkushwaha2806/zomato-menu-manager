import MenuSync from "@/model/menu-sync";
import { NextResponse } from "next/server";
import { swiggyProcessorJob } from "@/lib/bullmq/job/swiggy-processor";
import dbConnect from "@/lib/dbConnect";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const { syncId, accountName } = await req.json();
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

        await MenuSync.updateOne(
            { _id: syncId },
            {
                $set: {
                    status: "processing",
                },
            }
        );

        const categories =
            sync.updated_menu?.categories || [];

        const createCategories = [];
        const updateCategories = [];
        const deleteCategoryIds = [];

        for (const category of categories) {
            switch (category.action) {
                case "create":
                    createCategories.push(category);
                    break;

                case "update":
                    updateCategories.push(category);
                    break;

                case "delete":
                    if (category.id) {
                        deleteCategoryIds.push(category.id);
                    }
                    break;

                default:
                    console.warn(
                        `Unknown category action: ${category.action}`
                    );
            }
        }

        await Promise.all(
            createCategories.map((category) =>
                swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "category",
                    action: "create",
                    payload: category,
                    accountName,
                })
            )
        );

        await Promise.all(
            updateCategories.map((category) =>
                swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "category",
                    action: "update",
                    payload: category,
                    accountName,
                })
            )
        );

        if (deleteCategoryIds.length) {
            await swiggyProcessorJob({
                resId,
                syncId,
                type: "category",
                action: "delete",
                payload: {
                    category_ids: deleteCategoryIds,
                },
                accountName,
            });
        }

                const totalQueued =
                    createCategories.length +
                    updateCategories.length +
                    (deleteCategoryIds.length ? 1 : 0);

                if (totalQueued === 0) {
                    console.log(`No categories to sync. Moving to sub_category_sync for sync ${syncId}`);
                    await swiggyProcessorJob({
                        resId,
                        syncId,
                        type: "sub_category_sync",
                        accountName,
                    });
                }

                return NextResponse.json(
                    {
                        success: true,
                        syncId,

                        queued: {
                            create: createCategories.length,
                            update: updateCategories.length,
                            delete: deleteCategoryIds.length,
                        },

                        totalQueued,
                        nextStep: "categories",
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