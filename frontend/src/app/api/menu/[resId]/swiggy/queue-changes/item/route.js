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

        const items = sync.updated_menu?.items || [];

        console.log("items", items);

        const createItems = [];
        const updateItems = [];
        const deleteItemIds = [];

        for (const item of items) {
            switch (item.action) {
                case "create":
                    createItems.push(item);
                    break;

                case "update":
                    updateItems.push(item);
                    break;

                case "delete":
                    if (item.id) {
                        deleteItemIds.push(item.id);
                    }
                    break;

                default:
                    console.warn(`Unknown item action: ${item.action}`);
            }
        }

        await Promise.all(
            createItems.map((item) =>
                swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "item",
                    action: "create",
                    payload: item,
                    accountName,
                })
            )
        );

        await Promise.all(
            updateItems.map((item) =>
                swiggyProcessorJob({
                    resId,
                    syncId,
                    type: "item",
                    action: "update",
                    payload: item,
                    accountName,
                })
            )
        );

        if (deleteItemIds.length) {
            await swiggyProcessorJob({
                resId,
                syncId,
                type: "item",
                action: "delete",
                payload: {
                    item_ids: deleteItemIds,
                },
                accountName,
            });
        }

                const totalQueued =
                    createItems.length +
                    updateItems.length +
                    (deleteItemIds.length ? 1 : 0);

                if (totalQueued === 0) {
                    console.log(`No items to sync. Marking sync ${syncId} as completed`);
                    sync.status = "completed";
                    await sync.save();
                }

                return NextResponse.json(
                    {
                        success: true,
                        syncId,

                        queued: {
                            create: createItems.length,
                            update: updateItems.length,
                            delete: deleteItemIds.length,
                        },

                        totalQueued,
                        nextStep: "items",
                    },
                    { status: 200 }
                );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Something went wrong",
            },
            { status: 500 }
        );
    }
}
