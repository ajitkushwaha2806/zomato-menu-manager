import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { buildOwnlyCreateItemPayload } from "@/lib/payload/ownly/item-payload";
import FormDataNode from "form-data";
import sharp from "sharp";
import axios from "axios";

export const dynamic = "force-dynamic";

/**
 * Uploads an external image to Ownly storage before item creation
 */
async function uploadImageToOwnly(imageUrl, resId, req, accountName) {
    if (!imageUrl || !imageUrl.startsWith("http") || imageUrl.includes("storage.googleapis.com")) {
        return imageUrl;
    }

    try {
        const imgRes = await axios.get(imageUrl, {
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
            filename: `${resId}_item_${Date.now()}.jpg`,
            contentType: "image/jpeg",
        });

        const ownlyUploadRes = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/file/upload",
            method: "POST",
            data: uploadForm,
            headers: uploadForm.getHeaders(),
        });

        return ownlyUploadRes.data?.data?.fileUrl || ownlyUploadRes.data?.data?.filePath || ownlyUploadRes.data?.fileUrl || imageUrl;
    } catch (err) {
        console.warn(`[Ownly Add Item] Warning: Could not upload external image to Ownly storage: ${err.message}`);
        return imageUrl;
    }
}

/**
 * POST /api/menu/[resId]/ownly/items/add
 * Creates a new item (along with its category & subcategory) on Ownly live API and syncs to MongoDB.
 */
export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID is required." },
                { status: 400 }
            );
        }

        const body = await req.json();
        const accountName = body.accountName || req.headers.get("x-ownly-account") || req.headers.get("x-ownly-cookie");

        if (!body.name || (!body.name.trim())) {
            return NextResponse.json(
                { success: false, message: "Item name is required." },
                { status: 400 }
            );
        }

        const price = Number(body.price !== undefined ? body.price : (body.base_price ?? 0));

        await dbConnect();

        // 1. If an image is provided, ensure it is hosted on Ownly storage
        let finalImageUrl = body.imageUrl || body.image_url || (Array.isArray(body.media) && body.media[0]?.url) || "";
        if (finalImageUrl) {
            finalImageUrl = await uploadImageToOwnly(finalImageUrl, resId, req, accountName);
        }

        // 2. Fetch existing menu to reuse existing category / subcategory IDs if present
        const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });

        let existingCat = null;
        let existingSub = null;

        const targetCatId = body.categoryId || body.category?.id;
        const targetCatName = (body.categoryName || body.category?.name || "").trim().toLowerCase();
        const targetSubId = body.subCategoryId || body.subcategory?.id;
        const targetSubName = (body.subCategoryName || body.subcategory?.name || "").trim().toLowerCase();

        if (menuDoc?.menu) {
            for (const cat of menuDoc.menu) {
                if (
                    (targetCatId && String(cat.id) === String(targetCatId)) ||
                    (targetCatName && cat.name.trim().toLowerCase() === targetCatName)
                ) {
                    existingCat = cat;
                    for (const sub of cat.sub_category || []) {
                        if (
                            (targetSubId && String(sub.id) === String(targetSubId)) ||
                            (targetSubName && sub.name.trim().toLowerCase() === targetSubName)
                        ) {
                            existingSub = sub;
                            break;
                        }
                    }
                    break;
                }
            }
        }

        // 3. Construct Ownly item creation payload
        const payload = buildOwnlyCreateItemPayload({
            resId,
            item: {
                name: body.name,
                description: body.description || "",
                price,
                imageUrl: finalImageUrl,
                is_veg: body.is_veg || body.foodType || "veg",
                variants: body.variants || body.variantGroups || [],
                raw: body.raw || {},
            },
            category: body.category || existingCat || {
                id: targetCatId,
                name: body.categoryName || existingCat?.name || "Main Course",
            },
            subcategory: body.subcategory || existingSub || {
                id: targetSubId,
                name: body.subCategoryName || existingSub?.name || body.categoryName || "Main Course",
            },
            body: {
                ...body,
                imageUrl: finalImageUrl,
            },
        });

        console.log(`[Ownly Add Item] Submitting new item "${payload.name}" to Ownly POST /api/v1/menu/item...`);

        // 4. Send POST request to Ownly live API
        const ownlyResponse = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/menu/item",
            method: "POST",
            data: payload,
        });

        const resData = ownlyResponse.data;
        console.log(`[Ownly Add Item] Successfully created on Ownly:`, resData);

        // Extract IDs returned by Ownly
        const createdData = resData?.data || resData?.item || resData || {};
        const createdItemId = String(createdData.id || createdData.itemId || createdData._id || `item_${Date.now()}`);
        const createdCatId = String(createdData.category?.id || payload.category.id);
        const createdCatName = createdData.category?.name || payload.category.name;
        const createdSubId = String(createdData.subcategory?.id || payload.subcategory.id);
        const createdSubName = createdData.subcategory?.name || payload.subcategory.name;

        // 5. Structure MongoDB item
        const is_veg = payload.foodType === "non-veg" ? "NON_VEG" : (payload.foodType === "egg" ? "EGG" : "VEG");
        const media = finalImageUrl ? [{ url: finalImageUrl, thumbUrl: finalImageUrl, isNewlyUploaded: true }] : [];

        const newMenuItem = {
            id: createdItemId,
            name: payload.name,
            description: payload.description,
            price: payload.price,
            base_price: payload.price,
            min_price: payload.price,
            max_price: payload.price,
            is_veg,
            imageUrl: finalImageUrl,
            image_url: finalImageUrl,
            media,
            variants: body.variants || [],
            inStock: true,
            status: true,
            raw: createdData,
        };

        // 6. Update MongoDB Menu Document
        if (menuDoc) {
            let catObj = menuDoc.menu.find(c => String(c.id) === createdCatId || c.name.toLowerCase() === createdCatName.toLowerCase());
            if (!catObj) {
                catObj = {
                    id: createdCatId,
                    name: createdCatName,
                    sortOrder: menuDoc.menu.length,
                    sub_category: [],
                };
                menuDoc.menu.push(catObj);
            } else if (catObj.id.startsWith("temp-") || catObj.id.startsWith("temp_")) {
                catObj.id = createdCatId;
            }

            let subObj = (catObj.sub_category || []).find(s => String(s.id) === createdSubId || s.name.toLowerCase() === createdSubName.toLowerCase());
            if (!subObj) {
                subObj = {
                    id: createdSubId,
                    name: createdSubName,
                    items: [],
                };
                if (!catObj.sub_category) catObj.sub_category = [];
                catObj.sub_category.push(subObj);
            } else if (subObj.id.startsWith("temp-") || subObj.id.startsWith("temp_")) {
                subObj.id = createdSubId;
            }

            subObj.items.push(newMenuItem);

            await Menu.updateOne(
                { _id: menuDoc._id },
                { $set: { menu: menuDoc.menu } }
            );
        } else {
            await Menu.create({
                resId: String(resId),
                platform: "ownly",
                menu: [
                    {
                        id: createdCatId,
                        name: createdCatName,
                        sortOrder: 0,
                        sub_category: [
                            {
                                id: createdSubId,
                                name: createdSubName,
                                items: [newMenuItem],
                            },
                        ],
                    },
                ],
            });
        }

        return NextResponse.json({
            success: true,
            message: resData?.message || "Item created successfully on Ownly",
            item: newMenuItem,
            data: resData,
        });
    } catch (err) {
        console.error("Ownly Add Item Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to create item on Ownly",
            },
            { status: err.response?.status || 500 }
        );
    }
}

