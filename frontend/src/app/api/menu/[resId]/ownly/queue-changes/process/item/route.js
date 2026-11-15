import dbConnect from "@/lib/dbConnect";
import MenuSync from "@/model/menu-sync";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import { buildOwnlyItemPayload } from "../../../items/[itemId]/route";
import FormDataNode from "form-data";
import sharp from "sharp";
import axios from "axios";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const body = await req.json();
        const { syncId, action, payload, accountName: bodyAccountName } = body;
        const targetAccount = bodyAccountName || req.headers.get("x-ownly-account") || sync?.accountName;

        const sync = await MenuSync.findById(syncId);
        if (!sync) {
            return NextResponse.json(
                { success: false, message: "Sync not found." },
                { status: 404 }
            );
        }

        const itemId = String(payload?.originalId || payload?.id || payload?.itemId || "");
        if (!itemId) {
            return NextResponse.json(
                { success: false, message: "Missing item ID in payload." },
                { status: 400 }
            );
        }

        let apiError = null;
        let updateResult = null;

        try {
            // 1. Fetch current item from MongoDB
            const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
            let currentItem = null;
            let parentCat = null;

            if (menuDoc?.menu) {
                for (const cat of menuDoc.menu) {
                    for (const sub of cat.sub_category || []) {
                        for (const it of sub.items || []) {
                            if (String(it.id) === itemId) {
                                currentItem = it;
                                parentCat = cat;
                                break;
                            }
                        }
                        if (currentItem) break;
                    }
                    if (currentItem) break;
                }
            }

            // 2. If payload has an external image URL that needs uploading to Ownly storage
            let finalImageUrl = payload.imageUrl || payload.image_url || (Array.isArray(payload.media) && payload.media[0]?.url) || currentItem?.imageUrl || "";

            const isExternalImage = finalImageUrl && finalImageUrl.startsWith("http") && !finalImageUrl.includes("storage.googleapis.com");
            if (isExternalImage) {
                try {
                    console.log(`[Ownly Queue Item] Uploading external image for item ${itemId}: ${finalImageUrl}`);
                    const imgRes = await axios.get(finalImageUrl, {
                        responseType: "arraybuffer",
                        timeout: 10000,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                            Accept: "image/*,*/*;q=0.8",
                        },
                    });

                    let buffer = Buffer.from(imgRes.data);
                    buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();

                    const uploadForm = new FormDataNode();
                    uploadForm.append("directory", "menu-images");
                    uploadForm.append("file", buffer, {
                        filename: `${resId}_item_${itemId}.jpg`,
                        contentType: "image/jpeg",
                    });

                    const ownlyUploadRes = await ownlyClient({
                        req,
                        accountName: targetAccount,
                        endpoint: "/api/v1/file/upload",
                        method: "POST",
                        data: uploadForm,
                        headers: uploadForm.getHeaders(),
                    });

                    const newUploadedUrl = ownlyUploadRes.data?.data?.fileUrl || ownlyUploadRes.data?.data?.filePath || ownlyUploadRes.data?.fileUrl;
                    if (newUploadedUrl) {
                        finalImageUrl = newUploadedUrl;
                    }
                } catch (imgErr) {
                    console.warn(`[Ownly Queue Item] Warning: Could not upload external image to Ownly storage: ${imgErr.message}`);
                }
            }

            // 3. Build Ownly PUT item payload
            const itemUpdateData = {
                ...payload,
                imageUrl: finalImageUrl,
            };

            const ownlyPayload = buildOwnlyItemPayload(resId, itemId, currentItem, parentCat, itemUpdateData);

            // 4. Hit Ownly live PUT /api/v1/menu/item API
            const ownlyRes = await ownlyClient({
                req,
                accountName: targetAccount,
                endpoint: "/api/v1/menu/item",
                method: "PUT",
                data: ownlyPayload,
            });

            updateResult = ownlyRes.data;

            // 5. Update MongoDB Menu document
            if (menuDoc && currentItem) {
                currentItem.name = ownlyPayload.name;
                currentItem.description = ownlyPayload.description;
                currentItem.price = ownlyPayload.price;
                currentItem.base_price = ownlyPayload.price;
                currentItem.imageUrl = ownlyPayload.imageUrl;
                currentItem.image_url = ownlyPayload.imageUrl;
                currentItem.is_veg = ownlyPayload.foodType === "non-veg" ? "NON_VEG" : (ownlyPayload.foodType === "egg" ? "EGG" : "VEG");

                if (ownlyPayload.imageUrl) {
                    currentItem.media = [
                        {
                            url: ownlyPayload.imageUrl,
                            thumbUrl: ownlyPayload.imageUrl,
                            sourceUrl: payload.sourceUrl || "",
                            isNewlyUploaded: true,
                        },
                    ];
                }

                // Use updateOne to bypass Mongoose VersionError (__v conflict) caused by concurrent worker jobs
                await Menu.updateOne(
                    { _id: menuDoc._id },
                    { $set: { menu: menuDoc.menu } }
                );
            }
        } catch (err) {
            console.error(`[Ownly Queue Item] Error updating item ${itemId}:`, err.response?.data || err.message);
            apiError = err;
        }

        // 6. Update status in MenuSync document
        const errorMsg = apiError
            ? (apiError.response?.data?.message ||
               apiError.response?.data?.error ||
               (typeof apiError.response?.data === "string" ? apiError.response.data : null) ||
               apiError.message ||
               "Update failed")
            : null;

        if (apiError) {
            await MenuSync.updateOne(
                { _id: syncId, "updated_menu.items.id": itemId },
                {
                    $set: {
                        "updated_menu.items.$.status": "failed",
                        "updated_menu.items.$.error": errorMsg,
                    },
                }
            );
        } else {
            await MenuSync.updateOne(
                { _id: syncId, "updated_menu.items.id": itemId },
                {
                    $set: {
                        "updated_menu.items.$.status": "completed",
                        "updated_menu.items.$.error": null,
                    },
                }
            );
        }

        // 7. Check if all items in this MenuSync have finished
        const freshSync = await MenuSync.findById(syncId);
        const freshItems = freshSync?.updated_menu?.items || [];
        const pendingItems = freshItems.filter((itm) => itm.status !== "completed" && itm.status !== "failed");

        if (pendingItems.length === 0) {
            const hasFailures = freshItems.some((itm) => itm.status === "failed");
            console.log(`[Ownly Queue] All items finished for sync ${syncId}. Final status: ${hasFailures ? "completed_with_errors" : "completed"}`);

            await MenuSync.updateOne(
                { _id: syncId },
                { $set: { status: hasFailures ? "completed_with_errors" : "completed" } }
            );
        }

        return NextResponse.json({
            success: !apiError,
            syncId,
            itemId,
            action,
            pendingItems: pendingItems.length,
            data: updateResult,
            error: apiError ? (apiError.response?.data?.message || apiError.message || "Failed to update item on Ownly") : null,
        }, { status: 200 });
    } catch (error) {
        console.error("General error in Ownly queue-changes/process/item:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

