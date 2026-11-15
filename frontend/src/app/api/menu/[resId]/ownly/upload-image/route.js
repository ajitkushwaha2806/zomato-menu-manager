import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import FormDataNode from "form-data";
import sharp from "sharp";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import axios from "axios";
import { buildOwnlyItemPayload } from "../items/[itemId]/route";

export const dynamic = "force-dynamic";

async function syncImageToDb(resId, itemId, uploadedUrl, sourceUrl = "") {
    if (!resId || !itemId || !uploadedUrl) return;
    try {
        await dbConnect();
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
        if (menuDoc && Array.isArray(menuDoc.menu)) {
            let updatedInDb = false;
            for (const category of menuDoc.menu) {
                for (const sub of category.sub_category || []) {
                    for (const it of sub.items || []) {
                        if (String(it.id) === String(itemId)) {
                            it.media = [
                                {
                                    url: uploadedUrl,
                                    thumbUrl: uploadedUrl,
                                    sourceUrl: sourceUrl || "",
                                    mediaType: "PHOTO",
                                    source: "OWNLY_IMAGE_UPLOAD",
                                    isNewlyUploaded: true,
                                    isUploading: false,
                                },
                            ];
                            it.imageUrl = uploadedUrl;
                            it.image_url = uploadedUrl;
                            updatedInDb = true;
                            break;
                        }
                    }
                    if (updatedInDb) break;
                }
                if (updatedInDb) break;
            }
            if (updatedInDb) {
                await Menu.updateOne(
                    { _id: menuDoc._id },
                    { $set: { menu: menuDoc.menu } }
                );
            }
        }
    } catch (dbErr) {
        console.warn("Could not sync updated Ownly item image to MongoDB:", dbErr?.message);
    }
}

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID is required." },
                { status: 400 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file");
        const imageUrl = formData.get("imageUrl");
        const itemId = formData.get("itemId");
        const itemName = formData.get("itemName") || "item";

        if (!file && !imageUrl) {
            return NextResponse.json(
                { success: false, message: "No image file or image URL provided." },
                { status: 400 }
            );
        }

        let buffer = null;
        let filename = `${resId}_item_${itemId || Date.now()}_${Date.now()}.jpg`;

        if (file && typeof file.arrayBuffer === "function") {
            const rawBuffer = Buffer.from(await file.arrayBuffer());
            buffer = rawBuffer;
            if (file.name) {
                const clean = file.name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
                filename = `${resId}_${clean}`;
            }
        } else if (imageUrl && typeof imageUrl === "string") {
            const urlToFetch = imageUrl.trim();
            try {
                const res = await axios.get(urlToFetch, {
                    responseType: "arraybuffer",
                    timeout: 10000,
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                    },
                });
                buffer = Buffer.from(res.data);
            } catch (dlErr) {
                console.error(`Failed to download image from external URL (${urlToFetch}):`, dlErr.message);
                return NextResponse.json(
                    {
                        success: false,
                        message: `Could not download image from external URL: ${dlErr.message}`,
                    },
                    { status: 400 }
                );
            }
        }

        if (!buffer || buffer.length === 0) {
            return NextResponse.json(
                { success: false, message: "Empty or invalid image data." },
                { status: 400 }
            );
        }

        // Process with sharp to ensure standard JPEG formatting
        try {
            buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
            if (!filename.toLowerCase().endsWith(".jpg") && !filename.toLowerCase().endsWith(".jpeg")) {
                filename = `${filename.replace(/\.[^/.]+$/, "")}.jpg`;
            }
        } catch (sharpErr) {
            console.warn("Sharp image processing warning:", sharpErr.message);
        }

        // Prepare multipart form data for Ownly API
        const uploadForm = new FormDataNode();
        uploadForm.append("directory", "menu-images");
        uploadForm.append("file", buffer, {
            filename: filename,
            contentType: "image/jpeg",
        });

        // Call Ownly API: POST /api/v1/file/upload
        const ownlyRes = await ownlyClient({
            req,
            endpoint: "/api/v1/file/upload",
            method: "POST",
            data: uploadForm,
            headers: uploadForm.getHeaders(),
        });

        const resData = ownlyRes.data;
        const uploadedUrl =
            resData?.data?.fileUrl ||
            resData?.data?.filePath ||
            resData?.fileUrl ||
            resData?.filePath;

        if (!uploadedUrl) {
            console.error("Ownly file upload did not return a valid fileUrl:", resData);
            return NextResponse.json(
                {
                    success: false,
                    message: resData?.message || "Ownly image upload failed: missing fileUrl",
                    data: resData,
                },
                { status: 500 }
            );
        }

        // Sync uploaded image to live Ownly item and MongoDB if itemId was provided
        let liveItemUpdated = false;
        if (itemId) {
            try {
                await dbConnect();
                const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
                let currentItem = null;
                let parentCat = null;
                if (menuDoc?.menu) {
                    for (const cat of menuDoc.menu) {
                        for (const sub of cat.sub_category || []) {
                            for (const it of sub.items || []) {
                                if (String(it.id) === String(itemId)) {
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

                if (currentItem) {
                    const itemPayload = buildOwnlyItemPayload(resId, itemId, currentItem, parentCat, { imageUrl: uploadedUrl });
                    await ownlyClient({
                        req,
                        endpoint: "/api/v1/menu/item",
                        method: "PUT",
                        data: itemPayload,
                    });
                    liveItemUpdated = true;
                }
            } catch (ownlyUpdateErr) {
                console.warn("Could not immediately update Ownly item image via PUT /api/v1/menu/item:", ownlyUpdateErr.response?.data || ownlyUpdateErr.message);
            }

            await syncImageToDb(resId, itemId, uploadedUrl, imageUrl || "");
        }

        const mediaObj = {
            url: uploadedUrl,
            thumbUrl: uploadedUrl,
            sourceUrl: typeof imageUrl === "string" ? imageUrl : "",
            mediaType: "PHOTO",
            source: "OWNLY_IMAGE_UPLOAD",
            isNewlyUploaded: true,
            isUploading: false,
        };

        return NextResponse.json({
            success: true,
            message: "Image uploaded successfully to Ownly",
            url: uploadedUrl,
            displayUrl: uploadedUrl,
            fileUrl: uploadedUrl,
            itemUpdated: liveItemUpdated,
            mediaArray: [mediaObj],
            data: resData?.data,
        });
    } catch (err) {
        console.error("Ownly Image Upload Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to upload image to Ownly.",
            },
            { status: err.response?.status || 500 }
        );
    }
}

