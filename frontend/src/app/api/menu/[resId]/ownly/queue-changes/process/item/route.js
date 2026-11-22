import dbConnect from "@/lib/dbConnect";
import MenuSync from "@/model/menu-sync";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";
import { buildOwnlyCreateItemPayload, buildOwnlyUpdateItemPayload } from "@/lib/payload/ownly/item-payload";
import { parseOwnlyMenu } from "@/app/api/menu/[resId]/ownly/import/route";
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

        const sync = await MenuSync.findById(syncId);
        if (!sync) {
            return NextResponse.json(
                { success: false, message: "Sync not found." },
                { status: 404 }
            );
            
        }

        const targetAccount = bodyAccountName || req.headers.get("x-ownly-account") || sync.accountName;

        const itemId = String(payload?.originalId || payload?.id || payload?.itemId || "");
        if (!itemId) {
            return NextResponse.json(
                { success: false, message: "Missing item ID in payload." },
                { status: 400 }
            );
        }

        // Check if MenuSync already has updated real category/subcategory IDs from earlier items in this batch
        const syncItem = (sync.updated_menu?.items || []).find(
            (it) => String(it.id) === itemId || (it.temp_id && String(it.temp_id) === itemId)
        );
        if (syncItem) {
            if (syncItem.categoryId && !String(syncItem.categoryId).startsWith("temp")) {
                payload.categoryId = syncItem.categoryId;
            }
            if (syncItem.categoryName) {
                payload.categoryName = syncItem.categoryName;
            }
            if (syncItem.subCategoryId && !String(syncItem.subCategoryId).startsWith("temp")) {
                payload.subCategoryId = syncItem.subCategoryId;
            }
            if (syncItem.subCategoryName) {
                payload.subCategoryName = syncItem.subCategoryName;
            }
        }

        if (payload.categoryId && String(payload.categoryId).startsWith("temp")) {
            const resolvedCat = (sync.updated_menu?.categories || []).find(
                (c) => String(c.id) === String(payload.categoryId) ||
                       (payload.categoryName && c.name?.toLowerCase().trim() === payload.categoryName.toLowerCase().trim())
            );
            if (resolvedCat && resolvedCat.id && !String(resolvedCat.id).startsWith("temp")) {
                payload.categoryId = resolvedCat.id;
            }
        }

        if (payload.subCategoryId && String(payload.subCategoryId).startsWith("temp")) {
            const resolvedSub = (sync.updated_menu?.sub_categories || []).find(
                (s) => String(s.id) === String(payload.subCategoryId) ||
                       (payload.subCategoryName && s.name?.toLowerCase().trim() === payload.subCategoryName.toLowerCase().trim())
            );
            if (resolvedSub && resolvedSub.id && !String(resolvedSub.id).startsWith("temp")) {
                payload.subCategoryId = resolvedSub.id;
            }
        }

        let apiError = null;
        let updateResult = null;

        // Mark item as processing in MenuSync
        try {
            await MenuSync.updateOne(
                { _id: syncId, "updated_menu.items.id": itemId },
                { $set: { "updated_menu.items.$.status": "processing" } }
            );
        } catch (e) {
            console.warn("Could not set item status to processing", e);
        }

        try {
            // 1. Fetch current item from MongoDB
            const menuDoc = await Menu.findOne({ resId: String(resId), platform: "ownly" });
            let currentItem = null;
            let parentCat = null;
            let parentSub = null;

            if (menuDoc?.menu) {
                for (const cat of menuDoc.menu) {
                    for (const sub of cat.sub_category || []) {
                        for (const it of sub.items || []) {
                            if (String(it.id) === itemId || (it.temp_id && it.temp_id === itemId)) {
                                currentItem = it;
                                parentCat = cat;
                                parentSub = sub;
                                break;
                            }
                        }
                        if (currentItem) break;
                    }
                    if (currentItem) break;
                }

                // If parentCat wasn't resolved via item, find it in menuDoc by ID or Name
                if (!parentCat) {
                    parentCat = menuDoc.menu.find(
                        (c) => String(c.id) === String(payload.categoryId) ||
                               (c.temp_id && String(c.temp_id) === String(payload.categoryId)) ||
                               (payload.categoryName && c.name?.toLowerCase().trim() === payload.categoryName.toLowerCase().trim())
                    ) || null;
                }

                // If parentSub wasn't resolved via item, find it in parentCat by ID or Name
                if (parentCat && !parentSub) {
                    parentSub = (parentCat.sub_category || []).find(
                        (s) => String(s.id) === String(payload.subCategoryId) ||
                               (s.temp_id && String(s.temp_id) === String(payload.subCategoryId)) ||
                               (payload.subCategoryName && s.name?.toLowerCase().trim() === payload.subCategoryName.toLowerCase().trim())
                    ) || null;
                }

                // If parentCat has a real ID on Ownly, override payload & itemUpdateData
                if (parentCat && parentCat.id && !String(parentCat.id).startsWith("temp")) {
                    payload.categoryId = parentCat.id;
                    payload.category = {
                        id: parentCat.id,
                        name: parentCat.name,
                        providerId: parentCat.id,
                        sortOrder: parentCat.sortOrder || 0,
                    };
                }

                // If parentSub has a real ID on Ownly, override payload & itemUpdateData
                if (parentSub && parentSub.id && !String(parentSub.id).startsWith("temp")) {
                    payload.subCategoryId = parentSub.id;
                    payload.subcategory = {
                        id: parentSub.id,
                        name: parentSub.name,
                        providerId: parentSub.id,
                        sortOrder: parentSub.sortOrder || 0,
                    };
                }
            }

            const isDelete = action === "delete";
            const isCreate = action === "create" || itemId.startsWith("temp-") || itemId.startsWith("temp_") || (!currentItem && !isDelete);

            // Pre-check: If categoryId or subCategoryId is temp, query Ownly live menu
            // to see if a category/subcategory with the same name already exists on Ownly
            const catNeedsLookup = !payload.categoryId || String(payload.categoryId).startsWith("temp") || String(payload.categoryId).startsWith("cat-");
            const subNeedsLookup = !payload.subCategoryId || String(payload.subCategoryId).startsWith("temp") || String(payload.subCategoryId).startsWith("sub-");

            if (!isDelete && (catNeedsLookup || subNeedsLookup)) {
                try {
                    const targetCatName = (payload.categoryName || payload.category?.name || parentCat?.name || "").trim();
                    const targetSubName = (payload.subCategoryName || payload.subcategory?.name || parentSub?.name || targetCatName).trim();

                    console.log(`[Ownly Queue Item] Checking if category "${targetCatName}" / subcategory "${targetSubName}" already exists on Ownly...`);
                    const liveMenuRes = await ownlyClient({
                        req,
                        accountName: targetAccount,
                        endpoint: `/api/v1/menu?restaurant-id=${resId}`,
                        method: "GET",
                    });

                    const rawLiveMenu = liveMenuRes.data?.menu || liveMenuRes.data?.data?.menu || liveMenuRes.data?.data || liveMenuRes.data || {};
                    const liveCategories = Array.isArray(rawLiveMenu.categories) ? rawLiveMenu.categories : (Array.isArray(liveMenuRes.data?.categories) ? liveMenuRes.data.categories : []);

                    if (targetCatName && Array.isArray(liveCategories)) {
                        const matchedCat = liveCategories.find(
                            (c) => c.name?.toLowerCase().trim() === targetCatName.toLowerCase()
                        );

                        if (matchedCat && matchedCat.id && !String(matchedCat.id).startsWith("temp")) {
                            const realCatId = String(matchedCat.id);
                            console.log(`[Ownly Queue Item] Found existing category "${targetCatName}" on Ownly with real ID ${realCatId}`);
                            payload.categoryId = realCatId;
                            payload.category = {
                                id: realCatId,
                                name: matchedCat.name || targetCatName,
                                providerId: realCatId,
                                sortOrder: matchedCat.sortOrder || 0,
                            };
                            if (parentCat) {
                                parentCat.id = realCatId;
                                parentCat.name = matchedCat.name || targetCatName;
                            }

                            const subList = matchedCat.subcategories || matchedCat.subCategories || [];
                            if (subList.length === 0) {
                                // Category on Ownly has no subcategories (direct items under category)
                                console.log(`[Ownly Queue Item] Category "${targetCatName}" on Ownly has no subcategories. Omitting subcategory.`);
                                payload.subCategoryId = null;
                                payload.subcategory = null;
                                if (parentSub) {
                                    parentSub.id = null;
                                    parentSub.name = null;
                                }
                            } else {
                                let matchedSub = subList.find(
                                    (s) => s.name?.toLowerCase().trim() === targetSubName.toLowerCase()
                                );

                                if (!matchedSub && (targetSubName.toLowerCase() === targetCatName.toLowerCase() || String(payload.subCategoryId).startsWith("sub-"))) {
                                    matchedSub = subList[0];
                                }

                                if (matchedSub && matchedSub.id && !String(matchedSub.id).startsWith("temp")) {
                                    const realSubId = String(matchedSub.id);
                                    console.log(`[Ownly Queue Item] Found existing subcategory "${matchedSub.name || targetSubName}" on Ownly with real ID ${realSubId}`);
                                    payload.subCategoryId = realSubId;
                                    payload.subcategory = {
                                        id: realSubId,
                                        name: matchedSub.name || targetSubName,
                                        providerId: realSubId,
                                        sortOrder: matchedSub.sortOrder || 0,
                                    };
                                    if (parentSub) {
                                        parentSub.id = realSubId;
                                        parentSub.name = matchedSub.name || targetSubName;
                                    }
                                }
                            }
                        }
                    }
                } catch (lookupErr) {
                    console.warn("[Ownly Queue Item] Warning during pre-create live menu lookup:", lookupErr?.message);
                }
            }

            if (isDelete) {
                const isTemp = itemId.startsWith("temp-") || itemId.startsWith("temp_");

                if (!isTemp) {
                    const deleteCatId = String(payload.categoryId || parentCat?.id || `CAT_${resId}`);
                    const deleteSubId = payload.subCategoryId || parentSub?.id;
                    const subcategoryId = (deleteSubId && !String(deleteSubId).startsWith("sub-") && !String(deleteSubId).startsWith("temp"))
                        ? String(deleteSubId)
                        : null;

                    const deletePayload = {
                        restaurantId: String(resId),
                        categoryId: deleteCatId,
                        subcategoryId,
                        itemId: String(itemId),
                    };

                    console.log(`[Ownly Queue Item] Deleting item ${itemId} on Ownly via DELETE /api/v1/menu/item:`, deletePayload);

                    const ownlyRes = await ownlyClient({
                        req,
                        accountName: targetAccount,
                        endpoint: "/api/v1/menu/item",
                        method: "DELETE",
                        data: deletePayload,
                    });

                    updateResult = ownlyRes.data;
                }

                // Remove item from MongoDB Menu document
                if (menuDoc?.menu) {
                    for (const cat of menuDoc.menu) {
                        for (const sub of cat.sub_category || []) {
                            if (Array.isArray(sub.items)) {
                                sub.items = sub.items.filter((it) => String(it.id) !== itemId && it.temp_id !== itemId);
                            }
                        }
                        cat.sub_category = (cat.sub_category || []).filter(sub => (sub.items || []).length > 0);
                    }
                    menuDoc.menu = menuDoc.menu.filter(cat => (cat.sub_category || []).length > 0);
                    menuDoc.markModified("menu");
                    await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });
                }
            } else {
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

                const itemUpdateData = {
                    ...payload,
                    imageUrl: finalImageUrl,
                };

                // 3. Either Create (POST) or Update (PUT) on Ownly live API
            if (isCreate) {
                const createPayload = buildOwnlyCreateItemPayload({
                    resId,
                    item: payload,
                    category: parentCat || payload.category || { id: payload.categoryId, name: payload.categoryName },
                    subcategory: parentSub || payload.subcategory || { id: payload.subCategoryId, name: payload.subCategoryName },
                    body: itemUpdateData,
                });

                console.log(`[Ownly Queue Item] Creating new item on Ownly via POST /api/v1/menu/item: "${createPayload.name}"`);

                const ownlyRes = await ownlyClient({
                    req,
                    accountName: targetAccount,
                    endpoint: "/api/v1/menu/item",
                    method: "POST",
                    data: createPayload,
                });

                updateResult = ownlyRes.data;
                const createdData = updateResult?.data || updateResult?.item || updateResult || {};
                const newOwnlyId = String(createdData.id || createdData.itemId || createdData._id || itemId);
                let createdCatId = String(createdData.category?.id || createPayload.category?.id || "");
                let createdSubId = String(createdData.subcategory?.id || createPayload.subcategory?.id || "");
                const catName = (createPayload.category?.name || payload.categoryName || "").trim();
                const subName = (createPayload.subcategory?.name || payload.subCategoryName || "").trim();
                const oldCatId = payload.categoryId || (parentCat && parentCat.id);
                const oldSubId = payload.subCategoryId || (parentSub && parentSub.id);

                // Fetch live Ownly menu to resolve the exact real IDs created on Ownly
                let realCatId = (createdCatId && !createdCatId.startsWith("temp")) ? createdCatId : "";
                let realSubId = (createdSubId && !createdSubId.startsWith("temp")) ? createdSubId : "";

                try {
                    console.log(`[Ownly Queue Item] Fetching live Ownly menu after item creation to resolve real category/subcategory IDs for "${catName}" / "${subName}"...`);
                    const liveMenuRes = await ownlyClient({
                        req,
                        accountName: targetAccount,
                        endpoint: `/api/v1/menu?restaurant-id=${resId}`,
                        method: "GET",
                    });
                    const rawLiveMenu = liveMenuRes.data?.menu || liveMenuRes.data?.data?.menu || liveMenuRes.data?.data || liveMenuRes.data || {};
                    const liveCategories = Array.isArray(rawLiveMenu.categories) ? rawLiveMenu.categories : (Array.isArray(liveMenuRes.data?.categories) ? liveMenuRes.data.categories : []);

                    if (catName && Array.isArray(liveCategories)) {
                        const matchedCat = liveCategories.find(
                            (c) => c.name?.toLowerCase().trim() === catName.toLowerCase()
                        );
                        if (matchedCat && matchedCat.id && !String(matchedCat.id).startsWith("temp")) {
                            realCatId = String(matchedCat.id);
                            console.log(`[Ownly Queue Item] Resolved real category ID from live menu: ${realCatId}`);
                            const subList = matchedCat.subcategories || matchedCat.subCategories || [];
                            let matchedSub = subList.find(
                                (s) => s.name?.toLowerCase().trim() === subName.toLowerCase()
                            );
                            if (!matchedSub && subList.length > 0 && (subName.toLowerCase() === catName.toLowerCase() || String(oldSubId).startsWith("sub-"))) {
                                matchedSub = subList[0];
                            }
                            if (matchedSub && matchedSub.id && !String(matchedSub.id).startsWith("temp")) {
                                realSubId = String(matchedSub.id);
                                console.log(`[Ownly Queue Item] Resolved real subcategory ID from live menu: ${realSubId}`);
                            }
                        }
                    }
                } catch (liveErr) {
                    console.warn("[Ownly Queue Item] Warning fetching live menu after item create:", liveErr?.message);
                }

                const finalCatId = realCatId || (createdCatId && !createdCatId.startsWith("temp") ? createdCatId : "");
                const finalSubId = realSubId || (createdSubId && !createdSubId.startsWith("temp") ? createdSubId : "");

                // Update MongoDB Menu document
                if (menuDoc) {
                    if (!menuDoc.menu) menuDoc.menu = [];

                    let catObj = menuDoc.menu.find(c => 
                        (finalCatId && String(c.id) === String(finalCatId)) ||
                        (oldCatId && (String(c.id) === String(oldCatId) || (c.temp_id && String(c.temp_id) === String(oldCatId)))) ||
                        (catName && c.name?.toLowerCase().trim() === catName.toLowerCase())
                    );

                    if (!catObj) {
                        catObj = {
                            id: finalCatId || (oldCatId && !String(oldCatId).startsWith("temp") ? oldCatId : `cat_${Date.now()}`),
                            temp_id: (oldCatId && String(oldCatId).startsWith("temp")) ? oldCatId : "",
                            name: catName || "Main Course",
                            sortOrder: menuDoc.menu.length,
                            sub_category: []
                        };
                        menuDoc.menu.push(catObj);
                    } else if (finalCatId) {
                        catObj.id = finalCatId;
                        if (oldCatId && String(oldCatId).startsWith("temp")) {
                            catObj.temp_id = oldCatId;
                        }
                    }

                    if (!catObj.sub_category) catObj.sub_category = [];

                    let subObj = catObj.sub_category.find(s => 
                        (finalSubId && String(s.id) === String(finalSubId)) ||
                        (oldSubId && (String(s.id) === String(oldSubId) || (s.temp_id && String(s.temp_id) === String(oldSubId)))) ||
                        (subName && s.name?.toLowerCase().trim() === subName.toLowerCase())
                    );

                    if (!subObj) {
                        subObj = {
                            id: finalSubId || (oldSubId && !String(oldSubId).startsWith("temp") ? oldSubId : `sub_${Date.now()}`),
                            temp_id: (oldSubId && String(oldSubId).startsWith("temp")) ? oldSubId : "",
                            categoryId: catObj.id,
                            name: subName || catObj.name,
                            items: []
                        };
                        catObj.sub_category.push(subObj);
                    } else if (finalSubId) {
                        subObj.id = finalSubId;
                        if (oldSubId && String(oldSubId).startsWith("temp")) {
                            subObj.temp_id = oldSubId;
                        }
                    }

                    if (!subObj.items) subObj.items = [];

                    const is_veg = createPayload.foodType === "non-veg" ? "NON_VEG" : (createPayload.foodType === "egg" ? "EGG" : "VEG");
                    const media = createPayload.imageUrl ? [{ url: createPayload.imageUrl, thumbUrl: createPayload.imageUrl, isNewlyUploaded: true }] : [];

                    const savedItem = {
                        id: newOwnlyId,
                        temp_id: "",
                        name: createPayload.name,
                        description: createPayload.description || "",
                        price: createPayload.price,
                        base_price: createPayload.price,
                        min_price: createPayload.price,
                        max_price: createPayload.price,
                        is_veg,
                        imageUrl: createPayload.imageUrl || "",
                        image_url: createPayload.imageUrl || "",
                        media,
                        variants: payload.variants || [],
                        inStock: true,
                        status: true,
                        raw: createdData,
                    };

                    const existingIdx = subObj.items.findIndex(it => 
                        String(it.id) === newOwnlyId ||
                        String(it.id) === itemId ||
                        (it.temp_id && (it.temp_id === itemId || it.temp_id === newOwnlyId))
                    );

                    if (existingIdx >= 0) {
                        subObj.items[existingIdx] = { ...subObj.items[existingIdx], ...savedItem };
                    } else {
                        subObj.items.push(savedItem);
                    }

                    menuDoc.markModified("menu");
                    await Menu.updateOne({ _id: menuDoc._id }, { $set: { menu: menuDoc.menu } });
                }

                // If category or subcategory was created on Ownly with a real ID,
                // update ALL remaining items and category cards in MenuSync so subsequent items use the real ID
                try {
                    const freshSyncDoc = await MenuSync.findById(syncId);
                    if (freshSyncDoc?.updated_menu) {
                        let syncModified = false;

                        if (finalCatId) {
                            if (Array.isArray(freshSyncDoc.updated_menu.categories)) {
                                for (const cat of freshSyncDoc.updated_menu.categories) {
                                    if (cat.id === oldCatId || (catName && cat.name?.toLowerCase().trim() === catName.toLowerCase())) {
                                        cat.id = finalCatId;
                                        cat.status = "completed";
                                        syncModified = true;
                                    }
                                }
                            }
                            if (Array.isArray(freshSyncDoc.updated_menu.items)) {
                                for (const itm of freshSyncDoc.updated_menu.items) {
                                    if (
                                        itm.categoryId === oldCatId ||
                                        (catName && itm.categoryName?.toLowerCase().trim() === catName.toLowerCase()) ||
                                        (catName && itm.category?.name?.toLowerCase().trim() === catName.toLowerCase())
                                    ) {
                                        itm.categoryId = finalCatId;
                                        itm.category = {
                                            id: finalCatId,
                                            name: catName,
                                            providerId: finalCatId,
                                        };
                                        syncModified = true;
                                    }
                                }
                            }
                        }

                        if (finalSubId) {
                            if (Array.isArray(freshSyncDoc.updated_menu.sub_categories)) {
                                for (const sub of freshSyncDoc.updated_menu.sub_categories) {
                                    if (sub.id === oldSubId || (subName && sub.name?.toLowerCase().trim() === subName.toLowerCase())) {
                                        sub.id = finalSubId;
                                        if (finalCatId) sub.categoryId = finalCatId;
                                        sub.status = "completed";
                                        syncModified = true;
                                    }
                                }
                            }
                            if (Array.isArray(freshSyncDoc.updated_menu.items)) {
                                for (const itm of freshSyncDoc.updated_menu.items) {
                                    if (
                                        itm.subCategoryId === oldSubId ||
                                        (subName && itm.subCategoryName?.toLowerCase().trim() === subName.toLowerCase()) ||
                                        (subName && itm.subcategory?.name?.toLowerCase().trim() === subName.toLowerCase())
                                    ) {
                                        itm.subCategoryId = finalSubId;
                                        itm.subcategory = {
                                            id: finalSubId,
                                            name: subName,
                                            providerId: finalSubId,
                                        };
                                        syncModified = true;
                                    }
                                }
                            }
                        }

                        if (syncModified) {
                            freshSyncDoc.markModified("updated_menu");
                            await freshSyncDoc.save();
                            console.log(`[Ownly Queue Item] Successfully updated remaining unprocessed items in MenuSync with realCatId="${finalCatId}", realSubId="${finalSubId}"`);
                        }
                    }
                } catch (syncUpdateErr) {
                    console.warn("[Ownly Queue] Warning updating freshSyncDoc categories/subcategories:", syncUpdateErr.message);
                }
            } else {
                const ownlyPayload = buildOwnlyUpdateItemPayload({
                    resId,
                    itemId,
                    currentItem,
                    category: parentCat,
                    subcategory: parentSub,
                    body: itemUpdateData,
                });

                console.log(`[Ownly Queue Item] Updating item ${itemId} on Ownly via PUT /api/v1/menu/item...`);

                const ownlyRes = await ownlyClient({
                    req,
                    accountName: targetAccount,
                    endpoint: "/api/v1/menu/item",
                    method: "PUT",
                    data: ownlyPayload,
                });

                updateResult = ownlyRes.data;

                if (menuDoc && currentItem) {
                    currentItem.name = ownlyPayload.name;
                    currentItem.description = ownlyPayload.description;
                    currentItem.price = ownlyPayload.price;
                    currentItem.base_price = ownlyPayload.price;
                    currentItem.min_price = ownlyPayload.price;
                    currentItem.max_price = ownlyPayload.price;
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

                    // If item was moved to a different category / subcategory
                    if (menuDoc.menu && (payload.categoryId || payload.subCategoryId)) {
                        let currentSubObj = null;
                        for (const c of menuDoc.menu) {
                            for (const s of c.sub_category || []) {
                                if (s.items?.some(it => String(it.id) === itemId || (it.temp_id && it.temp_id === itemId))) {
                                    currentSubObj = s;
                                    break;
                                }
                            }
                            if (currentSubObj) break;
                        }

                        const targetCat = menuDoc.menu.find(c =>
                            (payload.categoryId && (String(c.id) === String(payload.categoryId) || c.temp_id === String(payload.categoryId))) ||
                            (payload.categoryName && c.name?.toLowerCase().trim() === payload.categoryName.toLowerCase().trim())
                        );

                        const targetSub = targetCat?.sub_category?.find(s =>
                            (payload.subCategoryId && (String(s.id) === String(payload.subCategoryId) || s.temp_id === String(payload.subCategoryId))) ||
                            (payload.subCategoryName && s.name?.toLowerCase().trim() === payload.subCategoryName.toLowerCase().trim())
                        );

                        if (targetSub && currentSubObj && targetSub !== currentSubObj) {
                            currentSubObj.items = (currentSubObj.items || []).filter(it => String(it.id) !== itemId && it.temp_id !== itemId);
                            if (!targetSub.items) targetSub.items = [];
                            if (!targetSub.items.some(it => String(it.id) === itemId)) {
                                targetSub.items.push(currentItem);
                            }
                        }
                    }

                    menuDoc.markModified("menu");
                    await Menu.updateOne(
                        { _id: menuDoc._id },
                        { $set: { menu: menuDoc.menu } }
                    );
                }
            }
        }
    } catch (err) {
            console.error(`[Ownly Queue Item] Error processing item ${itemId}:`, err.response?.data || err.message);
            apiError = err;
        }

        // 6. Update status in MenuSync document
        let errorMsg = null;
        if (apiError) {
            const errData = apiError.response?.data;
            if (typeof errData === "string") {
                errorMsg = errData;
            } else if (errData && typeof errData === "object") {
                errorMsg = errData.displayMessage ||
                           errData.message ||
                           (typeof errData.error === "string" ? errData.error : (errData.error?.displayMessage || errData.error?.message)) ||
                           JSON.stringify(errData);
            } else {
                errorMsg = apiError.message || "Update failed";
            }
        }

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

            const updatedMenu = freshSync.updated_menu || {};
            if (Array.isArray(updatedMenu.categories)) {
                updatedMenu.categories.forEach(c => {
                    if (!c.status || c.status === "pending" || c.status === "processing") {
                        c.status = hasFailures ? "completed_with_errors" : "completed";
                    }
                });
            }
            if (Array.isArray(updatedMenu.sub_categories)) {
                updatedMenu.sub_categories.forEach(s => {
                    if (!s.status || s.status === "pending" || s.status === "processing") {
                        s.status = hasFailures ? "completed_with_errors" : "completed";
                    }
                });
            }

            await MenuSync.updateOne(
                { _id: syncId },
                { 
                    $set: { 
                        status: hasFailures ? "completed_with_errors" : "completed",
                        updated_menu: updatedMenu
                    } 
                }
            );

            // Auto-refresh MongoDB Menu from Ownly so all items, categories, and subcategories immediately appear in the app
            try {
                console.log(`[Ownly Queue] All items finished. Fetching live Ownly menu to refresh MongoDB Menu for ${resId}...`);
                const ownlyMenuRes = await ownlyClient({
                    req,
                    accountName: targetAccount,
                    endpoint: `/api/v1/menu?restaurant-id=${resId}`,
                    method: "GET",
                });
                const rawMenuData = ownlyMenuRes.data?.data || ownlyMenuRes.data;
                if (rawMenuData) {
                    const parsed = parseOwnlyMenu(rawMenuData, resId);
                    if (parsed && Array.isArray(parsed.menu) && parsed.menu.length > 0) {
                        await Menu.updateOne(
                            { resId: String(resId), platform: "ownly" },
                            { $set: { menu: parsed.menu } },
                            { upsert: true }
                        );
                        console.log(`[Ownly Queue] Successfully refreshed MongoDB Menu from Ownly (${parsed.total_items} items).`);
                    }
                }
            } catch (refErr) {
                console.warn("[Ownly Queue] Warning auto-refreshing Ownly menu:", refErr.message);
            }
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

