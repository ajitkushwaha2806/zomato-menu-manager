import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import axios from "axios";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// -------------------------------------------------------------
// Helpers for Partner Portal Menu Import (when pageUrl is not provided)
// -------------------------------------------------------------
const getDeliveryPrice = (variantPrices = []) => {
    const match =
        variantPrices.find(
            (p) => p?.service?.toLowerCase() === "delivery"
        ) || variantPrices[0];

    return match?.price ?? match?.basePrice ?? 0;
};

const buildCatalogueLookup = (catalogueWrappers = []) => {
    const map = new Map();

    catalogueWrappers.forEach((wrapper) => {
        const catalogueId = wrapper?.catalogue?.catalogueId;
        if (catalogueId) map.set(catalogueId, wrapper);
    });

    return map;
};

const getBasePrice = (variantWrappers = []) => {
    const prices = variantWrappers
        .map((vw) => getDeliveryPrice(vw?.variantPrices))
        .filter((p) => typeof p === "number" && p > 0);

    if (prices.length === 0) {
        return 0;
    }

    return Math.min(...prices);
};

const parsePartnerPortalVariants = (catalogueWrapper) => {
    const propertyWrappers = catalogueWrapper?.cataloguePropertyWrappers || [];
    const variantWrappers = catalogueWrapper?.variantWrappers || [];

    if (propertyWrappers.length === 0) return [];
    const propertyValueToVariant = new Map();

    variantWrappers.forEach((variantWrapper) => {
        const variantId = variantWrapper?.variant?.variantId || "";
        const price = getDeliveryPrice(variantWrapper?.variantPrices);

        (variantWrapper?.variantPropertyValues || []).forEach((vpv) => {
            if (vpv?.propertyValueId) {
                propertyValueToVariant.set(vpv.propertyValueId, {
                    variantId,
                    price,
                });
            }
        });
    });

    return propertyWrappers
        .map((propertyWrapper) => {
            const property = propertyWrapper?.catalogueProperty;
            if (!property) return null;

            const values =
                propertyWrapper?.cataloguePropertyValues ||
                property?.propertyValues ||
                [];

            return {
                property_name: property?.name || "",
                property_id: property?.propertyId || "",

                options: values
                    .map((value) => {
                        const matched =
                            propertyValueToVariant.get(value?.propertyValueId) ||
                            {};

                        return {
                            option_name: value?.value || "",
                            option_id: value?.propertyValueId || "",
                            variant_id: matched?.variantId || "",
                            price: matched?.price || 0,
                        };
                    })
                    .sort((a, b) => a.price - b.price)
                    .map((opt, i) => {
                        opt.is_default = i === 0;
                        return opt;
                    }),
            };
        })
        .filter(Boolean);
};

const buildPartnerPortalItem = (catalogueWrapper, onHoldItems = {}) => {
    const catalogue = catalogueWrapper?.catalogue || {};
    const tags = catalogueWrapper?.catalogueTags || [];
    let base_price = getBasePrice(catalogueWrapper?.variantWrappers);

    const catalogueId = catalogue?.catalogueId || "";
    const holdData = onHoldItems?.catalogues?.[catalogueId];

    const parsedVariants = parsePartnerPortalVariants(catalogueWrapper);

    if (parsedVariants && parsedVariants.length > 0) {
        let lowestPrice = Infinity;
        parsedVariants.forEach((v) => {
            v.options?.forEach((opt) => {
                if (opt.price > 0 && opt.price < lowestPrice) {
                    lowestPrice = opt.price;
                }
            });
        });
        if (lowestPrice !== Infinity) {
            base_price = lowestPrice;
        }

        parsedVariants.sort((a, b) => {
            const minA = a.options?.[0]?.price || 0;
            const minB = b.options?.[0]?.price || 0;
            return minA - minB;
        });
    }

    return {
        id: catalogueId,
        temp_id: catalogue?.tempReferenceId || "",
        name: catalogue?.name || "",
        description: catalogue?.description || "",
        base_price,
        price: base_price,
        is_veg: tags.includes("egg")
            ? "EGG"
            : tags.includes("non-veg")
            ? "NON_VEG"
            : "VEG",
        packing_charges: 0,
        media: (Array.isArray(catalogue?.media) && catalogue.media.length > 0)
            ? catalogue.media
            : (extractZomatoImageUrl(catalogue) ? [{ url: extractZomatoImageUrl(catalogue) }] : []),
        variants: parsedVariants,
        meatTypes: catalogue?.meatTypes,
        onHold: !!holdData,
        holdComments: holdData?.comments || [],
        addons: [],
    };
};

export const parseZomatoCatalogueMenu = (data, onHoldItems = {}) => {
    const categoryWrappers = data?.categoryWrappers || [];
    const catalogueWrappers = data?.catalogueWrappers || [];
    const catalogueLookup = buildCatalogueLookup(catalogueWrappers);

    const parsedMenu = categoryWrappers.map((categoryWrapper) => {
        const category = categoryWrapper?.category || {};
        const subCategoryWrappers = categoryWrapper?.subCategoryWrappers || [];

        return {
            id: category?.categoryId || "",
            temp_id: "",
            name: category?.name || "",

            sub_category: subCategoryWrappers.map((subWrapper) => {
                const subCategory = subWrapper?.subCategory || {};
                const entities = subWrapper?.subCategoryEntities || [];

                const items = entities
                    .filter((entity) => entity?.entityType === "catalogue")
                    .map((entity) => catalogueLookup.get(entity?.entityId))
                    .filter(Boolean)
                    .map((cw) => buildPartnerPortalItem(cw, onHoldItems));

                return {
                    id: subCategory?.subCategoryId || "",
                    temp_id: "",
                    name: subCategory?.name?.trim() || "nota",
                    items,
                };
            }),
        };
    });

    const modifierGroupWrappers = data?.modifierGroupWrappers || [];
    const variantLookup = new Map();

    catalogueWrappers.forEach((wrapper) => {
        wrapper?.variantWrappers?.forEach((vw) => {
            if (vw?.variant?.variantId) {
                variantLookup.set(vw.variant.variantId, {
                    wrapper,
                    variant: vw,
                });
            }
        });
    });

    const parsedAddons = modifierGroupWrappers
        .filter((groupWrapper) => !groupWrapper?.modifierGroup?.excludeFromGlobal)
        .map((groupWrapper) => {
            const mg = groupWrapper?.modifierGroup || {};

            const options = (groupWrapper?.variantModifierGroupMaps || [])
                .map((map) => {
                    const vInfo = variantLookup.get(map.variantId);
                    if (!vInfo) return null;

                    const cat = vInfo.wrapper.catalogue;
                    const price = getDeliveryPrice(vInfo.variant.variantPrices);
                    const tags = vInfo.wrapper.catalogueTags || [];

                    let is_veg = "NONE";
                    if (tags.includes("veg")) is_veg = "VEG";
                    else if (tags.includes("non-veg")) is_veg = "NON_VEG";
                    else if (tags.includes("egg")) is_veg = "EGG";

                    return {
                        id: map.variantId,
                        catalogue_id: cat?.catalogueId || "",
                        name: cat?.name || "",
                        price: price,
                        is_veg: is_veg,
                        map_id: map.id,
                    };
                })
                .filter(Boolean);

            return {
                id: mg.modifierGroupId,
                name: mg.name || "",
                min: mg.min || 0,
                max: mg.max || 1,
                is_compulsory: (mg.min || 0) > 0,
                allow_multiple: mg.maxSelectionsPerItem > 1,
                max_per_item: mg.maxSelectionsPerItem || 1,
                options: options,
            };
        });

    const validAddonIds = new Set(parsedAddons.map((a) => a.id));

    catalogueWrappers.forEach((wrapper) => {
        const itemAddonIds = new Set();

        wrapper?.variantWrappers?.forEach((vw) => {
            vw?.variantModifierGroupMaps?.forEach((map) => {
                if (
                    map.variantIsParent &&
                    map.modifierGroupId &&
                    validAddonIds.has(map.modifierGroupId)
                ) {
                    itemAddonIds.add(map.modifierGroupId);
                }
            });
        });

        if (itemAddonIds.size > 0) {
            parsedMenu.forEach((cat) => {
                cat.sub_category?.forEach((sub) => {
                    const item = sub.items?.find(
                        (i) => i.id === wrapper.catalogue?.catalogueId
                    );
                    if (item) {
                        item.addons = Array.from(itemAddonIds);
                    }
                });
            });
        }
    });

    return { parsedMenu, parsedAddons };
};

// -------------------------------------------------------------
// Helpers for Zomato Public Page URL Import & Media Upload Flow
// -------------------------------------------------------------
const getNormalizedUrl = (url) => {
    let cleanedUrl = (url || "").trim();
    if (!/^https?:\/\//i.test(cleanedUrl)) {
        cleanedUrl = `https://${cleanedUrl}`;
    }

    const parsed = new URL(cleanedUrl);
    const domain = `${parsed.protocol}//${parsed.host}`;
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (parts.length < 2) {
        throw new Error("Invalid URL: city and outlet_name are required (e.g. https://www.zomato.com/city/outlet/order)");
    }

    const city = parts[0];
    const outletName = parts[1];
    return `${domain}/${city}/${outletName}/order`;
};

const parseVariantGroups = (itemData) => {
    if (!itemData || !Array.isArray(itemData.groups)) {
        return [];
    }

    return itemData.groups
        .map((groupWrapper) => {
            const group = groupWrapper?.group;
            if (!group) return null;

            const rawItems = Array.isArray(group?.items) ? group.items : [];
            const propId = `temp-${crypto.randomUUID()}`;

            return {
                property_name: group?.name || group?.label || "Variant",
                property_id: propId,
                options: rawItems
                    .map((itemWrapper, idx) => {
                        const option = itemWrapper?.item || {};
                        const optPrice = Number(
                            option?.price ||
                            option?.default_price ||
                            option?.display_price ||
                            option?.min_price ||
                            0
                        );

                        return {
                            option_name: option?.name || "",
                            option_id: `temp-${crypto.randomUUID()}`,
                            variant_id: `temp-${crypto.randomUUID()}`,
                            price: optPrice,
                            is_default: !!option?.is_default || idx === 0,
                        };
                    })
                    .sort((a, b) => a.price - b.price),
            };
        })
        .filter(Boolean);
};

const extractZomatoImageUrl = (itemData) => {
    if (!itemData) return null;

    let url = null;
    if (typeof itemData.item_image_url === "string" && itemData.item_image_url.trim()) {
        url = itemData.item_image_url.trim();
    } else if (typeof itemData.image_url === "string" && itemData.image_url.trim()) {
        url = itemData.image_url.trim();
    } else if (typeof itemData.imageUrl === "string" && itemData.imageUrl.trim()) {
        url = itemData.imageUrl.trim();
    } else if (typeof itemData.thumb_url === "string" && itemData.thumb_url.trim()) {
        url = itemData.thumb_url.trim();
    } else if (typeof itemData.thumbUrl === "string" && itemData.thumbUrl.trim()) {
        url = itemData.thumbUrl.trim();
    } else if (Array.isArray(itemData.media) && itemData.media.length > 0) {
        const first = itemData.media[0];
        if (typeof first === "string" && first.trim()) url = first.trim();
        else if (first?.image?.url) url = first.image.url;
        else if (typeof first?.url === "string") url = first.url;
        else if (typeof first?.thumbUrl === "string") url = first.thumbUrl;
    } else if (typeof itemData.media?.url === "string" && itemData.media.url.trim()) {
        url = itemData.media.url.trim();
    } else if (typeof itemData.image?.url === "string" && itemData.image.url.trim()) {
        url = itemData.image.url.trim();
    } else if (typeof itemData.image === "string" && itemData.image.trim()) {
        url = itemData.image.trim();
    } else if (typeof itemData.item_image?.url === "string" && itemData.item_image.url.trim()) {
        url = itemData.item_image.url.trim();
    } else if (typeof itemData.item_image === "string" && itemData.item_image.trim()) {
        url = itemData.item_image.trim();
    }

    if (url && url.startsWith("//")) {
        url = "https:" + url;
    }
    return url ? url.trim() : null;
};

/**
 * Downloads an image from external URL and uploads it to Zomato's upload_image API,
 * returning the structured media object ready to be stored in the item's media array.
 */
async function uploadImageFromUrlToZomato({ req, resId, imageUrl, itemName, itemId }) {
    if (!imageUrl) return null;

    try {
        let cleanUrl = String(imageUrl).trim();
        if (cleanUrl.startsWith("//")) {
            cleanUrl = `https:${cleanUrl}`;
        }

        const imgResp = await axios.get(cleanUrl, {
            responseType: "arraybuffer",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
            timeout: 15000,
        });

        const contentTypeRaw = imgResp.headers["content-type"] || "image/jpeg";
        const contentType = contentTypeRaw.split(";")[0].trim().toLowerCase();
        let buffer = Buffer.from(imgResp.data);
        let finalContentType = "image/jpeg";
        let filename = "upload.jpg";

        try {
            const sharp = require("sharp");
            buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
            finalContentType = "image/jpeg";
            filename = "upload.jpg";
        } catch (sharpErr) {
            finalContentType = contentType.startsWith("image/") ? contentType : "image/jpeg";
            let ext = "jpg";
            if (finalContentType.includes("png")) ext = "png";
            else if (finalContentType.includes("webp")) ext = "webp";
            else if (finalContentType.includes("avif")) ext = "avif";
            filename = `upload.${ext}`;
        }

        const FormDataNode = require("form-data");
        const uploadForm = new FormDataNode();
        uploadForm.append("res_id", String(resId));
        uploadForm.append("is_addon_item", "0");
        uploadForm.append("is_charge_item", "0");
        uploadForm.append("data_file", buffer, {
            filename: filename,
            contentType: finalContentType,
        });

        const zomatoCookie =
            req?.headers?.get("x-zomato-cookie") ||
            process.env.ZOMATO_COOKIES ||
            "";

        const uploadResult = await apiClient({
            req,
            endpoint: "/php/online_ordering/menu_edit",
            method: "POST",
            params: {
                action: "upload_image",
                service_role: "DELIVERY_TAKEAWAY",
                page_key: "menu",
            },
            data: uploadForm,
            headers: {
                ...uploadForm.getHeaders(),
                ...(zomatoCookie ? { Cookie: zomatoCookie } : {}),
            },
        });

        if (!uploadResult?.success) {
            console.error(`[ZOMATO UPLOAD] Failed for "${itemName}":`, uploadResult?.message);
            return null;
        }

        const data = uploadResult?.data?.data || uploadResult?.data;
        const isRejected = data?.image_stock_info?.isStock === true;
        if (isRejected) {
            console.warn(`[ZOMATO UPLOAD] Image for "${itemName}" was rejected as stock photo.`);
            return null;
        }

        const urlStr = data?.image_url || data?.url || null;
        let fileName = filename;
        let fileDirectory = "";
        if (urlStr) {
            try {
                const urlObj = new URL(urlStr);
                const pathParts = urlObj.pathname.split("/");
                fileName = pathParts.pop() || filename;
                const fullDir = pathParts.join("/") + "/";
                fileDirectory = fullDir.startsWith("/") ? fullDir.slice(1) : fullDir;
            } catch (e) {
                console.error("Failed to parse image URL:", e);
            }
        }

        return {
            tempReferenceId: `temp-${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`,
            mediaType: "PHOTO",
            mediaId: data?.image_id || data?.mediaId || fileName,
            order: 1,
            usageType: "FOODSHOT",
            entityType: "CATALOGUE",
            entityId: itemId || "",
            url: urlStr,
            thumbUrl:
                data?.thumb_url ||
                data?.thumbUrl ||
                (urlStr ? `${urlStr}?fit=around%7C200%3A200&crop=200%3A200%3B%2A%2C%2A` : ""),
            fileDirectory: fileDirectory,
            source: "MS_MENU_TOOL",
            fileName: fileName,
            mediaTags: [{ tagSlug: "uid_media" }],
            usageTypeEnum: "USAGE_TYPE_FOODSHOT",
            isNewlyUploaded: true,
            metadata: {
                dimensions: {
                    width: data?.width || 1800,
                    height: data?.height || 1200,
                },
            },
            isStockPhoto: false,
            isZoomed: false,
            isLowScore: false,
            isUploading: false,
        };
    } catch (err) {
        console.error(`[ZOMATO UPLOAD] Error uploading image for "${itemName}":`, err.message);
        return null;
    }
}

/**
 * Full flow when pageUrl is passed:
 * 1. Fetch menu and modifierGroups from webroutes/getPage
 * 2. Parse menu structure and addons
 * 3. Immediately save initial menu to MongoDB
 * 4. Sequentially (one by one) upload all item images to Zomato upload API
 * 5. Update items with returned media and persist to MongoDB
 */
async function importFromZomatoPageUrl(req, resId, rawPageUrl, options = {}) {
    const pageUrl = getNormalizedUrl(rawPageUrl);
    const zomatoCookie =
        req?.headers?.get("x-zomato-cookie") ||
        process.env.ZOMATO_COOKIES ||
        "";

    const response = await axios.get(
        "https://www.zomato.com/webroutes/getPage",
        {
            params: {
                page_url: pageUrl,
                location: "",
                isMobile: 0,
            },
            headers: {
                accept: "*/*",
                "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                ...(zomatoCookie ? { cookie: zomatoCookie } : {}),
            },
            timeout: 25000,
        }
    );

    const pageData = response?.data?.page_data || {};
    const menus = pageData?.order?.menuList?.menus || [];
    const rawModifierGroups = pageData?.order?.menuList?.modifierGroups || {};
    const restaurantName = pageData?.sections?.SECTION_BASIC_INFO?.name || "";

    // 1. Parse Addons (Modifier Groups)
    const modifierGroupEntries = Array.isArray(rawModifierGroups)
        ? rawModifierGroups
        : Object.values(rawModifierGroups || {});

    const parsedAddons = [];
    const groupIdToAddonId = new Map();

    for (const groupWrapper of modifierGroupEntries) {
        const group = groupWrapper?.group;
        if (!group?.name) continue;

        const addonId = `temp-${crypto.randomUUID()}`;
        const rawGroupItems = Array.isArray(group.items) ? group.items : [];
        const resolvedOptions = [];

        for (const itemWrapper of rawGroupItems) {
            const zItem = itemWrapper?.item;
            if (!zItem?.name) continue;

            const price = Number(
                zItem.price ||
                zItem.default_price ||
                zItem.display_price ||
                zItem.min_price ||
                0
            );

            let optDietary = "NON_VEG";
            const optSlugs = [
                ...(Array.isArray(zItem.dietary_slugs) ? zItem.dietary_slugs : []),
                ...(Array.isArray(zItem.tag_slugs) ? zItem.tag_slugs : []),
            ].map((s) => String(s).toLowerCase());

            if (optSlugs.some((s) => s.includes("egg"))) {
                optDietary = "EGG";
            } else if (optSlugs.some((s) => s.includes("veg") && !s.includes("non-veg"))) {
                optDietary = "VEG";
            }

            resolvedOptions.push({
                id: `temp-${crypto.randomUUID()}`,
                catalogue_id: "",
                name: zItem.name?.trim() || "",
                description: zItem.desc || "",
                price: price,
                is_veg: optDietary,
                is_default: !!zItem.is_default || false,
                map_id: `temp-${crypto.randomUUID()}`,
            });
        }

        const minVal = group.min ?? 0;
        const maxVal = group.max ?? 1;

        parsedAddons.push({
            id: addonId,
            name: group.name?.trim() || "",
            min: minVal,
            max: maxVal,
            is_compulsory: minVal > 0,
            allow_multiple: maxVal > 1,
            max_per_item: group.maxSelectionsPerItem || maxVal || 1,
            options: resolvedOptions,
        });

        const rawGid = group.id || group.group_id || group.modifier_group_id;
        if (rawGid) {
            groupIdToAddonId.set(String(rawGid), addonId);
        }
    }

    // 2. Parse Menu Categories & Items
    const parsedMenu = [];
    const itemsToUpload = [];

    for (const menuWrapper of menus) {
        const menu = menuWrapper?.menu || {};
        const categoryName = menu.name?.trim();
        if (!categoryName) continue;

        const subCategories = Array.isArray(menu.categories) ? menu.categories : [];
        const parsedSubCategories = [];

        for (const subWrapper of subCategories) {
            const subCategoryData = subWrapper?.category || {};
            const subCategoryName = subCategoryData.name?.trim() || categoryName;

            const rawItems = Array.isArray(subCategoryData.items) ? subCategoryData.items : [];
            const parsedItems = [];

            for (const itemWrapper of rawItems) {
                const itemData = itemWrapper?.item || {};
                if (!itemData.name?.trim()) continue;

                const variants = parseVariantGroups(itemData);

                let basePrice = Number(
                    itemData.price ||
                    itemData.default_price ||
                    itemData.display_price ||
                    itemData.min_price ||
                    0
                );

                if (variants.length > 0) {
                    let lowestPrice = Infinity;
                    variants.forEach((v) => {
                        v.options?.forEach((opt) => {
                            if (opt.price > 0 && opt.price < lowestPrice) {
                                lowestPrice = opt.price;
                            }
                        });
                    });
                    if (lowestPrice !== Infinity && (!basePrice || lowestPrice < basePrice)) {
                        basePrice = lowestPrice;
                    }
                }

                let dietaryType = "NON_VEG";
                const slugs = [
                    ...(Array.isArray(itemData.dietary_slugs) ? itemData.dietary_slugs : []),
                    ...(Array.isArray(itemData.tag_slugs) ? itemData.tag_slugs : []),
                ].map((s) => String(s).toLowerCase());

                if (slugs.some((s) => s.includes("egg"))) {
                    dietaryType = "EGG";
                } else if (slugs.some((s) => s.includes("veg") && !s.includes("non-veg"))) {
                    dietaryType = "VEG";
                } else {
                    dietaryType = "NON_VEG";
                }

                // Match addons
                const linkedAddons = [];
                const itemGroupIds = [
                    ...(Array.isArray(itemData.modifier_group_ids) ? itemData.modifier_group_ids : []),
                    ...(Array.isArray(itemData.modifier_groups) ? itemData.modifier_groups : []),
                    ...(Array.isArray(itemData.group_ids) ? itemData.group_ids : []),
                ];
                itemGroupIds.forEach((gid) => {
                    const idStr = typeof gid === "object" ? String(gid?.id || gid?.group_id) : String(gid);
                    const matchedAddonId = groupIdToAddonId.get(idStr);
                    if (matchedAddonId && !linkedAddons.includes(matchedAddonId)) {
                        linkedAddons.push(matchedAddonId);
                    }
                });

                const itemId = `temp-${crypto.randomUUID()}`;
                const rawImageUrl = extractZomatoImageUrl(itemData);

                const itemObj = {
                    id: itemId,
                    temp_id: "",
                    name: itemData.name.trim(),
                    description: itemData.desc?.trim() || "",
                    base_price: basePrice,
                    price: basePrice,
                    min_price: Number(itemData.min_price || basePrice),
                    max_price: Number(itemData.max_price || basePrice),
                    is_veg: dietaryType,
                    packing_charges: 0,
                    media: rawImageUrl ? [{ url: rawImageUrl }] : [],
                    variants: variants,
                    ...(dietaryType === "NON_VEG" ? { meatTypes: ["chicken"] } : {}),
                    onHold: false,
                    holdComments: [],
                    addons: linkedAddons,
                };

                parsedItems.push(itemObj);

                if (rawImageUrl) {
                    itemsToUpload.push({
                        item: itemObj,
                        imageUrl: rawImageUrl,
                    });
                }
            }

            parsedSubCategories.push({
                id: `temp-${crypto.randomUUID()}`,
                temp_id: "",
                name: subCategoryName,
                items: parsedItems,
            });
        }

        parsedMenu.push({
            id: `temp-${crypto.randomUUID()}`,
            temp_id: "",
            name: categoryName,
            sub_category: parsedSubCategories,
        });
    }

    // 3. Save parsed menu data with direct media URLs to DB
    const initialUpdateData = {
        resId,
        platform: "zomato",
        menu: parsedMenu,
        addons: parsedAddons,
        updatedAt: new Date(),
    };
    if (restaurantName) {
        initialUpdateData.name = restaurantName;
    }

    let savedMenu = await Menu.findOneAndUpdate(
        { resId, platform: "zomato" },
        { $set: initialUpdateData },
        { new: true, upsert: true }
    );

    console.log(`[ZOMATO IMPORT] Menu saved with ${itemsToUpload.length} item images directly linked.`);

    // 4. Only upload to Zomato's upload API if explicitly requested (default: false, no upload needed)
    const shouldUploadToZomato = options.uploadImagesToZomato === true || options.uploadToZomato === true;
    let uploadedCount = 0;
    let failedCount = 0;

    if (shouldUploadToZomato && itemsToUpload.length > 0) {
        for (let i = 0; i < itemsToUpload.length; i++) {
            const { item, imageUrl } = itemsToUpload[i];
            try {
                console.log(`[ZOMATO IMPORT] Uploading image (${i + 1}/${itemsToUpload.length}) for "${item.name}"...`);
                const mediaObj = await uploadImageFromUrlToZomato({
                    req,
                    resId,
                    imageUrl,
                    itemName: item.name,
                    itemId: item.id,
                });

                if (mediaObj) {
                    item.media = [mediaObj];
                    uploadedCount++;
                } else {
                    failedCount++;
                }
            } catch (err) {
                console.error(`[ZOMATO IMPORT] Error on image for "${item.name}":`, err.message);
                failedCount++;
            }

            // Periodically persist progress to DB every 5 images or on the last one
            if ((i + 1) % 5 === 0 || i === itemsToUpload.length - 1) {
                await Menu.updateOne(
                    { resId, platform: "zomato" },
                    { $set: { menu: parsedMenu, updatedAt: new Date() } }
                );
            }
        }

        savedMenu = await Menu.findOneAndUpdate(
            { resId, platform: "zomato" },
            {
                $set: {
                    menu: parsedMenu,
                    addons: parsedAddons,
                    updatedAt: new Date(),
                },
            },
            { new: true }
        );
    }

    const totalCategories = parsedMenu.length;
    const totalItems = parsedMenu.reduce(
        (sum, cat) =>
            sum +
            (cat.sub_category || []).reduce(
                (subSum, sub) => subSum + (sub.items || []).length,
                0
            ),
        0
    );

    return NextResponse.json(
        {
            success: true,
            message: "Menu imported successfully",
            data: savedMenu,
            total_categories: totalCategories,
            total_items: totalItems,
            stats: {
                categories: totalCategories,
                items: totalItems,
                totalImagesFound: itemsToUpload.length,
                imagesUploaded: uploadedCount,
                imagesFailed: failedCount,
                addonGroups: parsedAddons.length,
            },
        },
        { status: 200 }
    );
}

/**
 * Fallback: Partner Portal Import using Zomato Partner Portal API (action: "get_content_menu")
 */
async function importFromPartnerPortal(req, resId, options = {}) {
    const result = await apiClient({
        req,
        endpoint: "/php/online_ordering/menu_edit",
        method: "GET",
        params: {
            action: "get_content_menu",
            res_id: resId,
            service_role: "DELIVERY_TAKEAWAY",
        },
    });

    if (!result?.success) {
        return NextResponse.json(
            {
                success: false,
                message: result?.message || "Failed to fetch menu",
            },
            { status: result?.status || 500 }
        );
    }

    const menu =
        result?.data?.data?.menuResponse ??
        result?.data?.menuResponse ??
        null;

    const onHoldItems =
        result?.data?.onHoldItems ??
        result?.data?.menuResponse?.onHoldItems ??
        {};

    const { parsedMenu, parsedAddons } = parseZomatoCatalogueMenu(menu, onHoldItems);

    const restaurantName =
        options?.name ||
        req.headers.get("x-restaurant-name") ||
        result?.data?.data?.restaurantName ||
        result?.data?.restaurantName ||
        "";

    const updateSet = {
        resId,
        platform: "zomato",
        menu: parsedMenu,
        addons: parsedAddons,
        updatedAt: new Date(),
    };
    if (restaurantName) {
        updateSet.name = restaurantName;
    }

    const savedMenu = await Menu.findOneAndUpdate(
        { resId, platform: "zomato" },
        { $set: updateSet },
        { new: true, upsert: true }
    );

    let totalImagesFound = 0;
    const totalCategories = parsedMenu.length;
    const totalItems = parsedMenu.reduce(
        (sum, cat) =>
            sum +
            (cat.sub_category || []).reduce(
                (subSum, sub) => {
                    (sub.items || []).forEach((item) => {
                        if (
                            (item.media && item.media.length > 0) ||
                            item.image_url ||
                            item.image
                        ) {
                            totalImagesFound++;
                        }
                    });
                    return subSum + (sub.items || []).length;
                },
                0
            ),
        0
    );

    return NextResponse.json(
        {
            success: true,
            message: "Menu fetched successfully",
            data: savedMenu,
            parsedAddons: parsedAddons,
            total_categories: totalCategories,
            total_items: totalItems,
            stats: {
                categories: totalCategories,
                items: totalItems,
                totalImagesFound: totalImagesFound,
                imagesUploaded: 0,
                imagesFailed: 0,
                addonGroups: parsedAddons.length,
            },
            result: result,
        },
        { status: 200 }
    );
}

// -------------------------------------------------------------
// Route Handlers
// -------------------------------------------------------------
export async function GET(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(req.url);
        const pageUrlParam = searchParams.get("pageUrl");
        const uploadImagesToZomato = searchParams.get("uploadImagesToZomato") === "true";

        if (pageUrlParam) {
            return await importFromZomatoPageUrl(req, resId, pageUrlParam, { uploadImagesToZomato });
        }

        const nameParam = searchParams.get("name") || "";
        return await importFromPartnerPortal(req, resId, { name: nameParam });
    } catch (err) {
        console.error("Zomato Menu Import Route Error:", err);
        return NextResponse.json(
            {
                success: false,
                message: err?.response?.data?.message || err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        let pageUrlParam = null;
        let uploadImagesToZomato = false;
        let nameParam = "";
        try {
            const body = await req.json();
            pageUrlParam = body?.pageUrl;
            uploadImagesToZomato = body?.uploadImagesToZomato === true;
            nameParam = body?.name || "";
        } catch (e) {
            const { searchParams } = new URL(req.url);
            pageUrlParam = searchParams.get("pageUrl");
            uploadImagesToZomato = searchParams.get("uploadImagesToZomato") === "true";
            nameParam = searchParams.get("name") || "";
        }

        if (pageUrlParam) {
            return await importFromZomatoPageUrl(req, resId, pageUrlParam, { uploadImagesToZomato });
        }

        return await importFromPartnerPortal(req, resId, { name: nameParam });
    } catch (err) {
        console.error("Zomato Menu Import Route POST Error:", err);
        return NextResponse.json(
            {
                success: false,
                message: err?.response?.data?.message || err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}