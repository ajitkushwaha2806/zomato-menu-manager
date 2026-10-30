import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";
import FormDataNode from "form-data";
import sharp from "sharp";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import fs from "fs";
import path from "path";
import axios from "axios";

export const dynamic = "force-dynamic";

async function syncImageToDb(resId, itemId, uploadedUrl, uploadedKey, sourceUrl = "") {
    if (!resId || !itemId || !uploadedUrl) return;
    try {
        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "petpooja" });
        if (menuDoc && Array.isArray(menuDoc.menu)) {
            let updatedInDb = false;
            for (const category of menuDoc.menu) {
                for (const sub of (category.sub_category || [])) {
                    for (const it of (sub.items || [])) {
                        if (String(it.id) === String(itemId)) {
                            const publicDisplayUrl = (sourceUrl && !sourceUrl.includes("temp-uploads-live.s3")) 
                                ? sourceUrl 
                                : (!uploadedUrl.includes("temp-uploads-live.s3") ? uploadedUrl : (sourceUrl || uploadedUrl));

                            it.media = [{
                                url: publicDisplayUrl,
                                thumbUrl: publicDisplayUrl,
                                sourceUrl: sourceUrl || "",
                                key: uploadedKey,
                            }];
                            if (publicDisplayUrl && !publicDisplayUrl.includes("temp-uploads-live.s3")) {
                                it.image_url = publicDisplayUrl;
                            }
                            updatedInDb = true;
                            break;
                        }
                    }
                    if (updatedInDb) break;
                }
                if (updatedInDb) break;
            }
            if (updatedInDb) {
                menuDoc.markModified("menu");
                await menuDoc.save();
            }
        }
    } catch (dbErr) {
        console.warn("Could not sync updated Petpooja item image to MongoDB:", dbErr?.message);
    }
}

function preparePetpoojaPayload(rawItem, newImageKey = null, fallbackItemName = "item") {
    const rawData = rawItem?.data?.data || rawItem?.data?.item || rawItem?.data || rawItem;
    const currentItem = (rawData && typeof rawData === 'object' && (rawData.info || rawData.name || rawData.price)) ? rawData : (rawData?.data || rawData);
    if (!currentItem) return null;

    const currentInfo = currentItem.info || {};
    let dietary = currentInfo.dietary || currentItem.dietary || currentInfo.food_type || currentItem.food_type || "veg";
    if (dietary.toLowerCase() === "non_veg") dietary = "non-veg";
    else dietary = dietary.toLowerCase();

    let boneProperty = currentInfo.extra_info?.bone_property || currentItem.bone_property || null;
    if (boneProperty && typeof boneProperty === "string") {
        boneProperty = boneProperty.toUpperCase();
    } else if (dietary === "non-veg") {
        const itemNameLower = (currentInfo.name || currentItem.name || fallbackItemName || "").toLowerCase();
        if (/\b(bone|bones|leg|legs|wing|wings|drumstick|drumsticks|shank|shanks|rib|ribs|chop|chops)\b/i.test(itemNameLower) && !/\bboneless\b/i.test(itemNameLower)) {
            boneProperty = "BONE";
        } else if (/\bboneless\b/i.test(itemNameLower)) {
            boneProperty = "BONELESS";
        } else {
            boneProperty = "NOT_APPLICABLE";
        }
    }

    const existingImage = currentItem.images?.main || currentItem.image || currentItem.images?.platform?.zomato;
    const hasExistingImage = Boolean(existingImage && typeof existingImage === "string" && existingImage.trim() !== "");

    const payload = {
        ...currentItem,
        info: {
            ...currentInfo,
            category_id: Number(currentInfo.category_id || currentItem.category_id || currentItem.category?.id),
            name: currentInfo.name || currentItem.name || fallbackItemName,
            online_display_name: currentInfo.online_display_name || currentItem.online_display_name || currentInfo.name || currentItem.name || fallbackItemName,
            short_name: currentInfo.short_name || currentItem.short_name || "",
            dietary: dietary,
            price: Number(currentInfo.price ?? currentItem.price ?? 0),
            reduced_price: currentInfo.reduced_price ?? currentItem.reduced_price ?? null,
            packing_charges: Number(currentInfo.packing_charges ?? currentItem.packing_charges ?? 0),
            type: currentInfo.type || currentItem.type || "M",
            description: currentInfo.description ?? currentItem.description ?? null,
            goods_attribute: currentInfo.goods_attribute || currentItem.goods_attribute || "services",
            days_id: String(currentInfo.days_id || "-1"),
            schedule: currentInfo.schedule || { enabled: false, blocks: [] },
            order_type: Array.isArray(currentInfo.order_type) && currentInfo.order_type.length > 0
                ? currentInfo.order_type
                : (Array.isArray(currentItem.order_type) && currentItem.order_type.length > 0 ? currentItem.order_type : [1, 3]),
            desktop_order_type: Array.isArray(currentInfo.desktop_order_type) && currentInfo.desktop_order_type.length > 0
                ? currentInfo.desktop_order_type
                : [1],
            extra_info: {
                ...(currentInfo.extra_info || {}),
                ...(boneProperty ? { bone_property: boneProperty } : {}),
            },
        },
        images: {
            main: newImageKey,
        },
    };
    delete payload.id;

    return { payload, currentItem, hasExistingImage, existingImage };
}

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID is required" },
                { status: 400 }
            );
        }

        // Ensure Petpooja session is selected to this restaurant
        try {
            const sessionRes = await petpoojaClient({ req, endpoint: "/api/v1/session/me", method: "GET" });
            const currentSessionResId = sessionRes?.data?.restaurantId ? String(sessionRes.data.restaurantId) : null;
            if (currentSessionResId && currentSessionResId !== String(resId)) {
                await petpoojaClient({
                    req,
                    endpoint: "/api/v1/restaurants/select",
                    method: "POST",
                    data: { restaurant_id: String(resId) },
                });
            }
        } catch (sessErr) {
            console.warn("Could not check / select restaurant in Petpooja session:", sessErr?.message);
        }

        const formData = await req.formData();
        let file = formData.get("file");
        const providedImageUrl = formData.get("imageUrl");
        const itemName = formData.get("itemName") || "item";
        const itemId = formData.get("itemId");

        if (!file && !providedImageUrl) {
            return NextResponse.json(
                { success: false, message: "Image file or imageUrl is required" },
                { status: 400 }
            );
        }

        let itemPrep = null;

        // Step 1: If itemId is provided, check if the item already has an image on Petpooja.
        // If it does, automatically remove the 1st image and update item BEFORE uploading the 2nd image.
        if (itemId && !String(itemId).startsWith("temp-")) {
            try {
                const itemResp = await petpoojaClient({
                    req,
                    endpoint: `/api/v1/menu/items/${itemId}`,
                    method: "GET",
                });
                itemPrep = preparePetpoojaPayload(itemResp, null, itemName);

                if (itemPrep?.hasExistingImage) {
                    try {
                        console.log(`[Petpooja] Item ${itemId} has existing image (${itemPrep.existingImage}). Removing 1st image before uploading 2nd image...`);
                        await petpoojaClient({
                            req,
                            endpoint: `/api/v1/menu/items/${itemId}`,
                            method: "PUT",
                            data: itemPrep.payload, // payload has images: { main: null }
                        });
                        console.log(`[Petpooja] Successfully removed 1st image from item ${itemId}`);
                        await new Promise((r) => setTimeout(r, 400));
                    } catch (detachErr) {
                        console.warn(`[Petpooja] Warning removing 1st image from item ${itemId} (proceeding):`, detachErr?.message);
                    }
                }
            } catch (preErr) {
                console.warn(`[Petpooja] Pre-check for item ${itemId} warning:`, preErr?.message);
            }
        }

        let buffer;
        let filename = `${itemName.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;

        if (file) {
            const arrayBuffer = await file.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            if (file.name) {
                filename = file.name;
            }
        } else if (providedImageUrl) {
            let urlToFetch = providedImageUrl;
            try {
                const parsedUrl = new URL(providedImageUrl);
                if (parsedUrl.hostname.includes("google.") && parsedUrl.pathname === "/imgres") {
                    const imgurl = parsedUrl.searchParams.get("imgurl");
                    if (imgurl) {
                        urlToFetch = imgurl.startsWith("http") ? imgurl : decodeURIComponent(imgurl);
                    }
                }
            } catch (e) {}

            let imageFetchError = null;

            // 1. First attempt: standard fetch with 7-second timeout
            try {
                const imageRes = await fetch(urlToFetch, {
                    signal: AbortSignal.timeout(7000),
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                    }
                });

                if (imageRes.ok) {
                    const arrayBuffer = await imageRes.arrayBuffer();
                    buffer = Buffer.from(arrayBuffer);
                } else {
                    imageFetchError = new Error(`External source returned HTTP ${imageRes.status}`);
                }
            } catch (err) {
                imageFetchError = err;
            }

            // 2. Second attempt: axios with 7-second timeout if fetch timed out or failed
            if (!buffer) {
                try {
                    const axiosRes = await axios.get(urlToFetch, {
                        responseType: "arraybuffer",
                        timeout: 7000,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
                        }
                    });
                    buffer = Buffer.from(axiosRes.data);
                } catch (axiosErr) {
                    console.warn(`External image download failed for URL ${urlToFetch}:`, imageFetchError?.message || axiosErr.message);
                    return NextResponse.json(
                        {
                            success: false,
                            message: `Could not download image from the external link (${imageFetchError?.message || axiosErr.message}). Please download the image to your computer and upload or drag-and-drop the file directly.`,
                        },
                        { status: 400 }
                    );
                }
            }
        }

        // Process with sharp:
        // 1. Convert to JPEG (since Petpooja expects image/jpeg)
        // 2. Ensure dimensions are at least 400x400 (Petpooja requirement: "Image must be at least 400x400px")
        try {
            const metadata = await sharp(buffer).metadata();
            let sharpInstance = sharp(buffer);

            const width = metadata.width || 0;
            const height = metadata.height || 0;

            if (width < 400 || height < 400) {
                const minDimension = Math.min(width || 1, height || 1);
                const scale = Math.max(450 / minDimension, 1.2);
                sharpInstance = sharpInstance.resize(Math.round((width || 400) * scale), Math.round((height || 400) * scale), {
                    fit: 'inside',
                    withoutEnlargement: false,
                });
            }

            buffer = await sharpInstance.jpeg({ quality: 90 }).toBuffer();
            if (!filename.endsWith(".jpg") && !filename.endsWith(".jpeg")) {
                filename = `${filename.replace(/\.[^/.]+$/, "")}.jpg`;
            }
        } catch (sharpErr) {
            console.warn("Sharp image processing warning:", sharpErr?.message);
        }

        const uploadForm = new FormDataNode();
        uploadForm.append("image", buffer, {
            filename: filename,
            contentType: "image/jpeg",
        });

        const uploadResult = await petpoojaClient({
            req,
            endpoint: "/api/v1/uploads/temp",
            method: "POST",
            data: uploadForm,
            headers: uploadForm.getHeaders(),
        });

        const uploadedUrl = uploadResult?.url || uploadResult?.data?.url || uploadResult?.imageUrl || uploadResult?.data?.imageUrl;
        const uploadedKey = uploadResult?.key || uploadResult?.data?.key || uploadResult?.imageKey || uploadResult?.data?.imageKey;

        if (!uploadedUrl || !uploadedKey) {
            console.error("Petpooja temporary upload returned unexpected response:", uploadResult);
            return NextResponse.json(
                {
                    success: false,
                    message: uploadResult?.message || uploadResult?.error || "Petpooja image upload failed: missing url or key",
                    data: uploadResult,
                },
                { status: 500 }
            );
        }

        // Cache a readable copy in Next.js public uploads so the browser is never blocked by private S3 permissions
        let localPublicUrl = "";
        try {
            const uploadsDir = path.join(process.cwd(), "public", "uploads", "petpooja");
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }
            const localFilePath = path.join(uploadsDir, uploadedKey);
            fs.writeFileSync(localFilePath, buffer);
            localPublicUrl = `/uploads/petpooja/${uploadedKey}`;
        } catch (saveErr) {
            console.warn("Could not save local image copy in public uploads:", saveErr?.message);
        }

        const reliableDisplayUrl = (providedImageUrl && !providedImageUrl.includes("temp-uploads-live.s3"))
            ? providedImageUrl
            : (localPublicUrl || uploadedUrl);

        let itemUpdated = false;

        // If an item ID is provided, instantly update the item on Petpooja with the new image
        if (itemId && !String(itemId).startsWith("temp-")) {
            try {
                if (!itemPrep) {
                    const itemResp = await petpoojaClient({
                        req,
                        endpoint: `/api/v1/menu/items/${itemId}`,
                        method: "GET",
                    });
                    itemPrep = preparePetpoojaPayload(itemResp, uploadedKey, itemName);
                } else {
                    itemPrep.payload.images = { main: uploadedKey };
                }

                if (!itemPrep?.payload) {
                    throw new Error("Could not prepare item update payload for Petpooja");
                }

                const putPayload = itemPrep.payload;

                let updateResult;
                try {
                    updateResult = await petpoojaClient({
                        req,
                        endpoint: `/api/v1/menu/items/${itemId}`,
                        method: "PUT",
                        data: putPayload,
                    });
                } catch (putErr) {
                    const putErrMsg = putErr?.message || "";
                    if (putErrMsg.toLowerCase().includes("duplicate image") || putErrMsg.toLowerCase().includes("zomato")) {
                        console.warn(`Encountered duplicate image validation on item ${itemId}. Forcing image detach and retrying...`);
                        try {
                            const detachPayload = { ...putPayload, images: { main: null } };
                            await petpoojaClient({
                                req,
                                endpoint: `/api/v1/menu/items/${itemId}`,
                                method: "PUT",
                                data: detachPayload,
                            });
                            await new Promise((r) => setTimeout(r, 500));
                            updateResult = await petpoojaClient({
                                req,
                                endpoint: `/api/v1/menu/items/${itemId}`,
                                method: "PUT",
                                data: putPayload,
                            });
                        } catch (retryErr) {
                            throw retryErr;
                        }
                    } else {
                        throw putErr;
                    }
                }

                if (updateResult?.success === 0 || updateResult?.error || updateResult?.errors) {
                    const rawErr = updateResult?.errors || updateResult?.error;
                    let errMsg = "Petpooja item update validation failed";
                    if (Array.isArray(rawErr)) {
                        errMsg = rawErr.join(", ");
                    } else if (typeof rawErr === "object" && rawErr !== null) {
                        errMsg = Object.entries(rawErr)
                            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                            .join("; ");
                    } else if (typeof rawErr === "string") {
                        errMsg = rawErr;
                    } else if (updateResult?.message) {
                        errMsg = updateResult.message;
                    }

                    console.warn(`Petpooja item ${itemId} update failed validation:`, errMsg);

                    // Sync image into MongoDB cache anyway since upload succeeded
                    await syncImageToDb(resId, itemId, uploadedUrl, uploadedKey, providedImageUrl);

                    const fallbackDisplay = reliableDisplayUrl;
                    return NextResponse.json({
                        success: false,
                        key: uploadedKey,
                        url: fallbackDisplay,
                        imageUrl: fallbackDisplay,
                        displayUrl: fallbackDisplay,
                        sourceUrl: providedImageUrl || "",
                        localUrl: localPublicUrl,
                        itemUpdated: false,
                        message: `Image uploaded to Petpooja, but updating item failed: ${errMsg}`,
                        details: updateResult,
                    }, { status: 422 });
                }

                itemUpdated = true;

                // Try fetching refreshed item to get the official CloudFront image URL if available
                let permanentCloudFrontUrl = "";
                try {
                    const refreshed = await petpoojaClient({
                        req,
                        endpoint: `/api/v1/menu/items/${itemId}`,
                        method: "GET",
                    });
                    const rawRef = refreshed?.data?.data || refreshed?.data?.item || refreshed?.data || refreshed;
                    const itm = (rawRef && typeof rawRef === "object" && (rawRef.info || rawRef.image || rawRef.images || rawRef.name)) ? rawRef : (rawRef?.data || rawRef);
                    const cloudFrontCandidate = itm?.images?.main || itm?.images?.platform?.zomato || itm?.images?.platform?.swiggy || itm?.image;
                    if (cloudFrontCandidate && typeof cloudFrontCandidate === "string" && !cloudFrontCandidate.includes("temp-uploads-live")) {
                        permanentCloudFrontUrl = cloudFrontCandidate;
                    }
                } catch (refErr) {
                    console.warn("Could not fetch refreshed item image:", refErr?.message);
                }

                const finalDisplayUrl = permanentCloudFrontUrl || reliableDisplayUrl;

                // Sync new image into local MongoDB Menu cache with loadable display URL
                await syncImageToDb(resId, itemId, finalDisplayUrl, uploadedKey, providedImageUrl);

                return NextResponse.json({
                    success: true,
                    key: uploadedKey,
                    url: finalDisplayUrl,
                    imageUrl: finalDisplayUrl,
                    displayUrl: finalDisplayUrl,
                    sourceUrl: providedImageUrl || "",
                    localUrl: localPublicUrl,
                    itemUpdated: true,
                    data: uploadResult,
                });
            } catch (updateErr) {
                console.error(`Failed to update item ${itemId} image on Petpooja:`, updateErr);

                // Sync image into MongoDB cache anyway since upload succeeded
                const fallbackDisplay = reliableDisplayUrl;
                await syncImageToDb(resId, itemId, fallbackDisplay, uploadedKey, providedImageUrl);

                const rawErr = updateErr?.responseData?.errors || updateErr?.responseData?.error || updateErr?.response?.data?.errors || updateErr?.response?.data?.error;
                let errMsg = updateErr?.detailedError || updateErr?.response?.data?.message || updateErr?.message || "Failed to update item image on Petpooja";
                if (!updateErr?.detailedError && rawErr && typeof rawErr === "object") {
                    errMsg = Object.entries(rawErr)
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                        .join("; ");
                }

                return NextResponse.json({
                    success: false,
                    key: uploadedKey,
                    url: fallbackDisplay,
                    imageUrl: fallbackDisplay,
                    displayUrl: fallbackDisplay,
                    sourceUrl: providedImageUrl || "",
                    localUrl: localPublicUrl,
                    itemUpdated: false,
                    message: `Petpooja item update failed: ${errMsg}`,
                    data: uploadResult,
                }, { status: 422 });
            }
        }

        const generalDisplay = reliableDisplayUrl;
        return NextResponse.json({
            success: true,
            key: uploadedKey,
            url: generalDisplay,
            imageUrl: generalDisplay,
            displayUrl: generalDisplay,
            sourceUrl: providedImageUrl || "",
            localUrl: localPublicUrl,
            itemUpdated,
            data: uploadResult,
        });
    } catch (err) {
        console.error("Petpooja Image Upload Route Error:", err);
        return NextResponse.json(
            {
                success: false,
                message: err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}
