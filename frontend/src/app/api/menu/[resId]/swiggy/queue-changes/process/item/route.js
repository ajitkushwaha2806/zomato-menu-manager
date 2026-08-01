import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import MenuSync from "@/model/menu-sync";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;
        const body = await req.json();

        const { syncId, action, payload } = body;

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
        let api = `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/items`;

        switch (action) {
            case "create":
                api = `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/items/add`;
                method = "post";
                break;

            case "update":
                api = `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/items/update`;
                method = "post";
                break;

            case "delete":
                api = `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/items/delete`;
                method = "post";
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

        let requestPayload = { ...payload };

        if (action === "create" || action === "update") {
            // Extract image_url and image_id from media array if they exist there
            if (!requestPayload.image_url && requestPayload.media && Array.isArray(requestPayload.media) && requestPayload.media.length > 0) {
                const m = requestPayload.media[0];
                requestPayload.image_url = typeof m === 'string' ? m : (m.url || m.utl || "");
                requestPayload.image_id = typeof m === 'string' ? null : (m.image_id || m.imageId || m.mediaId || m.id || null);
            }

            // Upload if we have an image_url AND (it's missing an image_id OR it's not a Swiggy image)
            const isSwiggyImage = requestPayload.image_url?.includes("swiggy") || requestPayload.image_url?.includes("cloudinary");
            const needsUpload = !requestPayload.image_id || !isSwiggyImage;
            if (requestPayload.image_url && requestPayload.image_url.startsWith("http") && needsUpload) {
                console.log(`[${syncId}] 🖼️ Processing image for item ${requestPayload.id}`);
                const formData = new FormData();
                formData.append("imageUrl", requestPayload.image_url);
                formData.append("itemName", requestPayload.name || "Menu Item");

                try {
                    const uploadRes = await fetch(
                        `${process.env.NEXT_PUBLIC_BASE_URL}/api/menu/${resId}/swiggy/items/image`,
                        {
                            method: "POST",
                            body: formData,
                            headers: {
                                "x-swiggy-account": accountName || "",
                            },
                        }
                    );

                    const uploadData = await uploadRes.json();

                    if (uploadData.success && uploadData.stableDiffusion?.data?.image_id) {
                        requestPayload.image_url = uploadData.file_url;
                        requestPayload.image_id = uploadData.stableDiffusion.data.image_id;
                        
                        // Also update the media array so it gets passed to the add/update routes correctly
                        if (requestPayload.media && requestPayload.media.length > 0) {
                            if (typeof requestPayload.media[0] === 'object') {
                                requestPayload.media[0].url = uploadData.file_url;
                                requestPayload.media[0].mediaId = uploadData.stableDiffusion.data.image_id;
                            }
                        }
                        console.log(`[${syncId}] ✅ Image uploaded successfully`);
                    } else {
                        requestPayload.image_url = "";
                        requestPayload.image_id = "";
                        console.warn(`[${syncId}] ⚠️ Failed to upload image:`, uploadData);
                    }
                } catch (err) {
                    requestPayload.image_url = "";
                    requestPayload.image_id = "";
                    console.error(`[${syncId}] ❌ Image upload error:`, err.message);
                }
            }
        }

        let data = null;
        let apiError = null;

        // Throttle to avoid hitting Swiggy API too fast
        await new Promise(resolve => setTimeout(resolve, 200));

        try {
            const response = await axios({
                method,
                url: api,
                data: requestPayload,
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
            console.error(`Swiggy API Error in item sync for action ${action}:`, err.message);
        }

        console.log("data", data)
        console.log("data item", data?.updatePayload?.item_vo?.item);
        console.log("data variants", data?.updatePayload?.item_vo?.variant_groups_vo);
        console.log("data variants var", data?.updatePayload?.item_vo?.variant_groups_vo[0]?.variants_vo);


        const items = sync.updated_menu?.items || [];

        const itemEntry = items.find((itm) => itm.id === payload.id);

        if (!itemEntry) {
            console.warn("Item not found in sync for payload", payload);
        }

        if (action === "create") {
            let swiggyItemId = data?.data?.id || data?.response?.data?.data?.id || data?.response?.data?.id;
            if (!swiggyItemId && typeof data?.response?.data === 'string') swiggyItemId = data.response.data;
            if (!swiggyItemId && typeof data?.data === 'string') swiggyItemId = data.data;
            if (!swiggyItemId && data?.response?.id) swiggyItemId = data.response.id;
            
            // Swiggy often returns the new ID as a raw string/number inside data.response.data.data
            if (!swiggyItemId && data?.response?.data?.data && (typeof data.response.data.data === 'string' || typeof data.response.data.data === 'number')) {
                swiggyItemId = String(data.response.data.data);
            }
            
            // Sometimes it's in data.response.data if the response itself is just the ID
            if (!swiggyItemId && data?.response?.data && (typeof data.response.data === 'string' || typeof data.response.data === 'number')) {
                swiggyItemId = String(data.response.data);
            }

            const tempId = payload?.id;
            
            // If we STILL don't have an ID, but Swiggy returned a success message, treat it as successful
            const successMessage = data?.response?.data?.message || data?.response?.data?.statusMessage || data?.message || "";
            if (!swiggyItemId && successMessage.toLowerCase().includes("success")) {
                console.warn(`Swiggy returned success but no ID found. Using tempId as fallback. Response: ${JSON.stringify(data?.response?.data)}`);
                swiggyItemId = tempId; 
            }

            console.log(swiggyItemId, tempId);

            if (!swiggyItemId || !tempId || apiError) {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.message || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "Item sync failed";
                console.error(`Item create failed. tempId: ${tempId}, Error: ${errorMsg}`);
                
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.items.id": payload.id },
                    {
                        $set: {
                            "updated_menu.items.$.status": "failed",
                            "updated_menu.items.$.error": errorMsg
                        }
                    }
                );
            } else {
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.items.id": payload.id },
                    {
                        $set: {
                            "updated_menu.items.$.id": swiggyItemId,
                            "updated_menu.items.$.status": "completed",
                            "updated_menu.items.$.error": null
                        }
                    }
                );

                // ─── Update main Menu document ────────────────────────────────
                const menuDoc = await Menu.findOne({ resId, platform: "swiggy" });
                if (menuDoc && Array.isArray(menuDoc.menu)) {
                    let changed = false;
                    menuDoc.menu = menuDoc.menu.map(cat => ({
                        ...cat,
                        sub_category: (cat.sub_category || []).map(sub => ({
                            ...sub,
                            items: (sub.items || []).map(item => {
                                if (String(item.id) === String(tempId)) {
                                    changed = true;
                                    return { ...item, id: swiggyItemId };
                                }
                                return item;
                            })
                        }))
                    }));
                    if (changed) {
                        menuDoc.markModified("menu");
                        await menuDoc.save();
                        console.log(`[${syncId}] ✅ Menu doc updated: temp item ${tempId} → ${swiggyItemId}`);
                    }
                }
                // ─────────────────────────────────────────────────────────────

                console.log(`Updated item ${tempId} -> ${swiggyItemId}`);
            }
        }

        if (action === "update") {
            if (apiError || data?.response?.data?.statusCode === -1 || data?.response?.data?.statusMessage === "FAILURE") {
                const errorMsg = data?.message || data?.response?.data?.statusMessage || data?.response?.data?.data?.error?.rejectMessage || apiError?.message || "Item update failed";
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.items.id": payload.id },
                    {
                        $set: {
                            "updated_menu.items.$.status": "failed",
                            "updated_menu.items.$.error": errorMsg
                        }
                    }
                );
            } else {
                await MenuSync.updateOne(
                    { _id: syncId, "updated_menu.items.id": payload.id },
                    {
                        $set: {
                            "updated_menu.items.$.status": "completed",
                            "updated_menu.items.$.error": null
                        }
                    }
                );
            }
        }

        if (action === "delete") {
            if (apiError) {
                if (payload.item_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.items.$[elem].status": "failed",
                                "updated_menu.items.$[elem].error": apiError.message || "Delete failed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.item_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.items.id": payload.id },
                        {
                            $set: {
                                "updated_menu.items.$.status": "failed",
                                "updated_menu.items.$.error": apiError.message || "Delete failed"
                            }
                        }
                    );
                }
            } else {
                if (payload.item_ids) {
                    await MenuSync.updateMany(
                        { _id: syncId },
                        {
                            $set: {
                                "updated_menu.items.$[elem].status": "completed"
                            }
                        },
                        {
                            arrayFilters: [{ "elem.id": { $in: payload.item_ids } }]
                        }
                    );
                } else if (payload.id) {
                    await MenuSync.updateOne(
                        { _id: syncId, "updated_menu.items.id": payload.id },
                        {
                            $set: {
                                "updated_menu.items.$.status": "completed"
                            }
                        }
                    );
                }
            }
        }

        const freshSync = await MenuSync.findById(syncId);
        const freshItems = freshSync?.updated_menu?.items || [];
        const pendingItems = freshItems.filter((itm) => ["create", "update", "delete"].includes(itm.action) && itm.status !== "completed" && itm.status !== "failed");

        if (pendingItems.length === 0) {
            console.log(`All items completed for sync ${syncId}`);

            // At this point, the entire MenuSync is actually completed!
            await MenuSync.updateOne(
                { _id: syncId },
                { $set: { status: "completed" } }
            );
        }

        return NextResponse.json(
            {
                success: true,
                syncId,
                action,
                pendingItems: pendingItems.length,
                data,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                success: false,
                message: error?.response?.data?.message || error?.message || "Something went wrong",
            },
            { status: 500 }
        );
    }
}
