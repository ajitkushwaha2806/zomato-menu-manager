import MenuSync from "@/model/menu-sync";
import { NextResponse } from "next/server";
import { swiggyProcessorJob } from "@/lib/bullmq/job/swiggy-processor";

export async function POST(req, { params }) {
    try {
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

        const subCategories =
            sync.updated_menu?.sub_categories || [];

        console.log("subCategories", subCategories)

        const createSubCategories = [];
        const updateSubCategories = [];
        const deleteSubCategoryIds = [];

        for (const subCategory of subCategories) {
            switch (subCategory.action) {
                case "create":
                    createSubCategories.push(subCategory);
                    break;

                case "update":
                    updateSubCategories.push(subCategory);
                    break;

                case "delete":
                    if (subCategory.id) {
                        deleteSubCategoryIds.push(
                            subCategory.id
                        );
                    }
                    break;

                default:
                    console.warn(
                        `Unknown subcategory action: ${subCategory.action}`
                    );
            }
        }

        await Promise.all(
            createSubCategories.map(
                (subCategory) =>
                    swiggyProcessorJob({
                        resId,
                        syncId,
                        type: "sub_category",
                        action: "create",
                        payload: subCategory,
                        accountName,
                    })
            )
        );

        await Promise.all(
            updateSubCategories.map(
                (subCategory) =>
                    swiggyProcessorJob({
                        resId,
                        syncId,
                        type: "sub_category",
                        action: "update",
                        payload: subCategory,
                        accountName,
                    })
            )
        );

        if (deleteSubCategoryIds.length) {
            await swiggyProcessorJob({
                resId,
                syncId,
                type: "sub_category",
                action: "delete",
                payload: {
                    sub_category_ids: deleteSubCategoryIds,
                },
                accountName,
            });
        }

        const totalQueued =
            createSubCategories.length +
            updateSubCategories.length +
            (deleteSubCategoryIds.length
                ? 1
                : 0);

        if (totalQueued === 0) {
            console.log(`No sub-categories to sync. Moving to item_sync for sync ${syncId}`);
            await swiggyProcessorJob({
                resId,
                syncId,
                type: "item_sync",
                accountName,
            });
        }

        return NextResponse.json(
            {
                success: true,
                syncId,

                queued: {
                    create:
                        createSubCategories.length,
                    update:
                        updateSubCategories.length,
                    delete:
                        deleteSubCategoryIds.length,
                },

                totalQueued,

                nextStep: "sub_categories",
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