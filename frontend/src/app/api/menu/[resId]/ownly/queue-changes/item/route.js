import MenuSync from "@/model/menu-sync";
import { NextResponse } from "next/server";
import { ownlyProcessorJob } from "@/lib/bullmq/job/ownly-processor";
import dbConnect from "@/lib/dbConnect";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const { syncId, accountName } = await req.json();

        const sync = await MenuSync.findById(syncId);
        if (!sync) {
            return NextResponse.json(
                { success: false, message: "Sync not found." },
                { status: 404 }
            );
        }

        const effectiveAccountName = accountName || sync.accountName;

        const items = sync.updated_menu?.items || [];
        console.log(`[Ownly Item Queue] Found ${items.length} items to process in sync ${syncId}`);

        const updateItems = [];

        for (const item of items) {
            const action = item.action || "update";
            if (action === "update" || action === "create") {
                updateItems.push(item);
            }
        }

        // Queue all items with action = "update"
        await Promise.all(
            updateItems.map((item) =>
                ownlyProcessorJob({
                    resId,
                    syncId,
                    type: "item",
                    action: item.action || "update",
                    payload: item,
                    accountName: effectiveAccountName,
                })
            )
        );

        const totalQueued = updateItems.length;

        if (totalQueued === 0) {
            console.log(`No items to update. Marking sync ${syncId} as completed.`);
            await MenuSync.updateOne({ _id: syncId }, { $set: { status: "completed" } });
        } else {
            await MenuSync.updateOne({ _id: syncId }, { $set: { status: "processing" } });
        }

        return NextResponse.json({
            success: true,
            totalQueued,
            message: `${totalQueued} items queued for Ownly update.`,
        });
    } catch (error) {
        console.error("Ownly queue-changes/item error:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Failed to queue items" },
            { status: 500 }
        );
    }
}

