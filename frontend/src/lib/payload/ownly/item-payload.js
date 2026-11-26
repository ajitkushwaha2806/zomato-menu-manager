import crypto from "crypto";
import { ownlyClient } from "@/lib/api/ownly-client";

/**
 * Normalizes food type to Ownly's expected values: "veg" | "non-veg" | "egg"
 */
export function normalizeFoodType(ft) {
    if (!ft) return "veg";
    const str = String(ft).toLowerCase().trim();
    if (str === "non_veg" || str === "non-veg" || str === "nonveg") return "non-veg";
    if (str === "egg") return "egg";
    return "veg";
}

/**
 * Transforms variants from either Menu Manager format or Ownly format
 * into the variantGroups schema required by Ownly API.
 */
export function buildOwnlyVariantGroups(variants = [], defaultFoodType = "veg") {
    if (!Array.isArray(variants) || variants.length === 0) return [];

    return variants
        .map((vg, vgIdx) => {
            const vgName = vg.name || vg.property_name || vg.group_name || `Quantity`;
            const vgId = vg.id || vg.property_id || crypto.randomUUID();

            const rawOptions = vg.variants || vg.options || [];
            const options = rawOptions.map((opt) => {
                const optName = opt.name || opt.option_name || "Regular";
                const optId = opt.id || opt.option_id || opt.variant_id || crypto.randomUUID();
                const priceModifier = Number(
                    opt.priceModifier !== undefined ? opt.priceModifier : (opt.price ?? 0)
                );
                const optFoodType = normalizeFoodType(opt.foodType || opt.food_type || defaultFoodType);

                return {
                    id: String(optId).startsWith("temp-") ? crypto.randomUUID() : String(optId),
                    name: optName,
                    description: opt.description || null,
                    priceModifier,
                    foodType: optFoodType,
                    isDefault: Boolean(opt.isDefault || opt.is_default),
                    inStock: opt.inStock !== false && opt.status !== false,
                };
            });

            return {
                id: String(vgId).startsWith("temp-") ? crypto.randomUUID() : String(vgId),
                name: vgName,
                description: vg.description || null,
                isRequired: Boolean(vg.isRequired || vg.is_required),
                maxSelections: Number(vg.maxSelections || vg.max_selections || 1),
                variants: options,
            };
        })
        .filter((vg) => vg.variants.length > 0);
}

/**
 * Formats category object for Ownly API.
 * If new category, formats as temp_category_<uuid>.
 * If old category, sends real ID and providerId: id.
 */
export function formatOwnlyCategory(category = {}, fallbackName = "Main Course") {
    const rawId = String(category.id || category.categoryId || "");
    const name = (category.name || category.categoryName || fallbackName).trim();
    const isTemp = !rawId || rawId.startsWith("temp-") || rawId.startsWith("temp_");

    let id;
    if (isTemp) {
        if (rawId.startsWith("temp_category_")) {
            id = rawId;
        } else if (rawId.startsWith("temp-")) {
            id = `temp_category_${rawId.replace(/^temp-/, "")}`;
        } else if (rawId.startsWith("temp_")) {
            id = `temp_category_${rawId.replace(/^temp_/, "")}`;
        } else {
            id = `temp_category_${crypto.randomUUID()}`;
        }
    } else {
        id = rawId;
    }

    return {
        id,
        name: name || "Main Course",
        description: category.description || "",
        imageUrl: category.imageUrl || "",
        providerId: isTemp ? "" : (category.providerId || id),
        sortOrder: Number(category.sortOrder ?? 0),
    };
}

/**
 * Formats subcategory object for Ownly API.
 * If new subcategory, formats as temp_subcategory_<uuid>.
 * If old subcategory, sends real ID and providerId: id.
 */
export function formatOwnlySubcategory(subcategory = {}, fallbackName = "Main Course") {
    const rawId = String(subcategory.id || subcategory.subCategoryId || "");
    const name = (subcategory.name || subcategory.subCategoryName || fallbackName).trim();
    const isTemp = !rawId || rawId.startsWith("temp-") || rawId.startsWith("temp_");

    let id;
    if (isTemp) {
        if (rawId.startsWith("temp_subcategory_")) {
            id = rawId;
        } else if (rawId.startsWith("temp-")) {
            id = `temp_subcategory_${rawId.replace(/^temp-/, "")}`;
        } else if (rawId.startsWith("temp_")) {
            id = `temp_subcategory_${rawId.replace(/^temp_/, "")}`;
        } else {
            id = `temp_subcategory_${crypto.randomUUID()}`;
        }
    } else {
        id = rawId;
    }

    return {
        id,
        name: name || "Main Course",
        description: subcategory.description || "",
        imageUrl: subcategory.imageUrl || "",
        providerId: isTemp ? "" : (subcategory.providerId || id),
        sortOrder: Number(subcategory.sortOrder ?? 0),
    };
}

/**
 * Default GST bill components if none are specified
 */
export function getOwnlyBillComponents(rawBillComponents) {
    if (
        rawBillComponents &&
        Array.isArray(rawBillComponents.taxes) &&
        rawBillComponents.taxes.length > 0
    ) {
        return rawBillComponents;
    }

    return {
        taxes: [
            {
                id: "GST_5",
                providerId: "GST_5",
                name: "GST (2.5% CGST + 2.5% SGST)",
                value: 5.0,
            },
        ],
    };
}

/**
 * Builds the exact JSON payload for creating an item on Ownly:
 * POST https://rxapi.ownly.food/api/v1/menu/item
 */
export function buildOwnlyCreateItemPayload({
    resId,
    item = {},
    category = {},
    subcategory = {},
    body = {},
}) {
    const raw = item.raw || {};

    const name = (body.name || item.name || "Item").trim();
    const description = (body.description !== undefined ? body.description : (item.description || "")).trim();
    
    // In our app UI, edits bind to base_price, while Ownly API uses price.
    // When base_price is present, it reflects the user's input/edit and takes precedence over stale price.
    let resolvedPrice = 0;
    if (body.base_price !== undefined && body.base_price !== null && body.base_price !== "") {
        resolvedPrice = Number(body.base_price);
    } else if (body.price !== undefined && body.price !== null && body.price !== "") {
        resolvedPrice = Number(body.price);
    } else if (item.base_price !== undefined && item.base_price !== null && item.base_price !== "") {
        resolvedPrice = Number(item.base_price);
    } else if (item.price !== undefined && item.price !== null && item.price !== "") {
        resolvedPrice = Number(item.price);
    }
    const price = Number(resolvedPrice || 0);

    const foodType = normalizeFoodType(
        body.foodType || body.is_veg || item.is_veg || raw.foodType || "veg"
    );

    const imageUrl =
        body.imageUrl ||
        body.image_url ||
        (Array.isArray(body.media) && body.media[0]?.url) ||
        item.imageUrl ||
        item.image_url ||
        (Array.isArray(item.media) && item.media[0]?.url) ||
        raw.imageUrl ||
        "";

    const rawCatId = body.categoryId || body.category?.id || category?.id || item.categoryId || "";
    const isCatReal = rawCatId && !String(rawCatId).startsWith("temp") && !String(rawCatId).startsWith("cat-");
    const resolvedCatName = body.categoryName || body.category?.name || category?.name || item.categoryName || "Main Course";

    const catObj = formatOwnlyCategory(
        isCatReal ? { id: String(rawCatId), name: resolvedCatName, providerId: String(rawCatId) } : (body.category || category),
        resolvedCatName
    );

    const isSubcategoryExplicitlyDisabled = body.subcategory === null || subcategory === null || body.subCategoryId === null;
    const rawSubId = isSubcategoryExplicitlyDisabled ? "" : (body.subCategoryId || body.subcategory?.id || subcategory?.id || item.subCategoryId || "");
    const isSubReal = rawSubId && !String(rawSubId).startsWith("temp") && !String(rawSubId).startsWith("sub-");
    const isSubTemp = rawSubId && (String(rawSubId).startsWith("temp-") || String(rawSubId).startsWith("temp_"));
    const resolvedSubName = body.subCategoryName || body.subcategory?.name || subcategory?.name || item.subCategoryName || catObj.name;

    let subcatObj = null;
    if (!isSubcategoryExplicitlyDisabled && (isSubReal || isSubTemp)) {
        subcatObj = formatOwnlySubcategory(
            isSubReal ? { id: String(rawSubId), name: resolvedSubName, providerId: String(rawSubId) } : (body.subcategory || subcategory),
            resolvedSubName
        );
    }

    const billComponents = getOwnlyBillComponents(body.billComponents || raw.billComponents);

    const ignoreOn = body.ignoreOn || raw.ignoreOn || {
        tax: false,
        discounts: false,
    };

    const variantGroups = buildOwnlyVariantGroups(
        body.variantGroups || body.variants || item.variants || raw.variantGroups || [],
        foodType
    );

    const payload = {
        restaurantId: String(resId),
        name,
        description,
        price,
        foodType,
        gstType: body.gstType || raw.gstType || "services",
        category: catObj,
        billComponents,
        ignoreOn,
    };

    if (subcatObj) {
        payload.subcategory = subcatObj;
    }

    if (imageUrl) {
        payload.imageUrl = imageUrl;
    }

    if (variantGroups.length > 0) {
        payload.variantGroups = variantGroups;
    }

    return payload;
}

/**
 * Resolves the brandId for an Ownly restaurant item
 */
export function resolveOwnlyBrandId({ currentItem = {}, menuDoc = {}, resId = "" }) {
    if (currentItem?.brandId) return currentItem.brandId;
    if (currentItem?.brandSkuId && String(currentItem.brandSkuId).startsWith("BR")) {
        return String(currentItem.brandSkuId).slice(0, 8);
    }
    if (currentItem?.raw?.brandId) return currentItem.raw.brandId;
    if (currentItem?.raw?.brandSkuId && String(currentItem.raw.brandSkuId).startsWith("BR")) {
        return String(currentItem.raw.brandSkuId).slice(0, 8);
    }
    if (menuDoc?.brandId) return menuDoc.brandId;
    if (menuDoc?.raw?.restaurant?.brandId) return menuDoc.raw.restaurant.brandId;

    if (Array.isArray(menuDoc?.menu)) {
        for (const cat of menuDoc.menu) {
            for (const sub of cat.sub_category || []) {
                for (const it of sub.items || []) {
                    if (it.brandId) return it.brandId;
                    if (it.brandSkuId && String(it.brandSkuId).startsWith("BR")) {
                        return String(it.brandSkuId).slice(0, 8);
                    }
                    if (it.raw?.brandSkuId && String(it.raw.brandSkuId).startsWith("BR")) {
                        return String(it.raw.brandSkuId).slice(0, 8);
                    }
                }
            }
        }
    }

    const numeric = String(resId).replace(/\D/g, "");
    return `BR${numeric}`;
}

/**
 * Resolves standard Ownly restaurant ID with "RN" prefix
 */
export function resolveOwnlyRestaurantId({ resId = "", currentItem = {}, itemId = "" }) {
    if (currentItem?.restaurantId && String(currentItem.restaurantId).startsWith("RN")) {
        return String(currentItem.restaurantId);
    }
    if (currentItem?.raw?.restaurantId && String(currentItem.raw.restaurantId).startsWith("RN")) {
        return String(currentItem.raw.restaurantId);
    }
    if (itemId && String(itemId).startsWith("RN") && String(itemId).includes("_")) {
        return String(itemId).split("_")[0];
    }
    const clean = String(resId || "").trim();
    if (!clean) return "";
    return clean.startsWith("RN") ? clean : `RN${clean}`;
}

/**
 * Builds the exact JSON payload for Step 1 of Ownly's item update:
 * POST https://rxapi.ownly.food/api/v1/menu/item-attributes/prepare
 */
export function buildOwnlyItemPreparePayload({
    resId,
    itemId,
    currentItem = {},
    body = {},
    category = null,
    subcategory = null,
}) {
    const raw = currentItem?.raw || {};
    const rnId = resolveOwnlyRestaurantId({ resId, currentItem, itemId });

    // 1. Food type
    const baselineFoodType = normalizeFoodType(
        currentItem.foodType || currentItem.is_veg || raw.foodType || "veg"
    );
    const draftFoodType = normalizeFoodType(
        body.foodType || body.is_veg || baselineFoodType
    );

    // 2. Prices
    const baselinePrice = Number(
        currentItem.price !== undefined && currentItem.price !== null
            ? currentItem.price
            : (currentItem.base_price ?? raw.price ?? 0)
    );
    const baselineMarkup = Number(currentItem.markupPrice ?? raw.markupPrice ?? 0);

    let draftPrice = baselinePrice;
    if (body.price !== undefined && body.price !== null && body.price !== "") {
        draftPrice = Number(body.price);
    } else if (body.base_price !== undefined && body.base_price !== null && body.base_price !== "") {
        draftPrice = Number(body.base_price);
    }
    const draftMarkup = Number(body.markupPrice ?? baselineMarkup);

    // 3. Category & Subcategory
    let catObj = null;
    if (category) {
        catObj = formatOwnlyCategory(category);
    } else if (body.category) {
        catObj = formatOwnlyCategory(body.category);
    } else if (currentItem.category || raw.category) {
        catObj = formatOwnlyCategory(currentItem.category || raw.category);
    }

    let subcatObj = null;
    if (subcategory) {
        subcatObj = formatOwnlySubcategory(subcategory);
    } else if (body.subcategory) {
        subcatObj = formatOwnlySubcategory(body.subcategory);
    } else if (currentItem.subcategory || raw.subcategory) {
        subcatObj = formatOwnlySubcategory(currentItem.subcategory || raw.subcategory);
    }

    // 4. Image URL
    const baselineImageUrl =
        currentItem.imageUrl ||
        currentItem.image_url ||
        (Array.isArray(currentItem.media) && currentItem.media[0]?.url) ||
        raw.imageUrl ||
        null;

    const draftImageUrl =
        body.imageUrl ||
        body.image_url ||
        (Array.isArray(body.media) && body.media[0]?.url) ||
        baselineImageUrl;

    // 5. Stock / In-Stock
    const baselineInStock =
        currentItem.inStock !== undefined
            ? Boolean(currentItem.inStock)
            : (currentItem.status !== undefined ? Boolean(currentItem.status) : (raw.inStock !== false));

    const draftInStock =
        body.inStock !== undefined
            ? Boolean(body.inStock)
            : (body.status !== undefined ? Boolean(body.status) : baselineInStock);

    // 6. Bill components & Ignore on
    const billComponents = getOwnlyBillComponents(currentItem.billComponents || raw.billComponents);
    const ignoreOn = currentItem.ignoreOn || raw.ignoreOn || { tax: false, discounts: false };

    // 7. Variant groups
    const baselineVariantGroups = buildOwnlyVariantGroups(
        currentItem.variants || currentItem.variantGroups || raw.variantGroups || [],
        baselineFoodType
    );
    const draftVariantGroups = (body.variantGroups || body.variants)
        ? buildOwnlyVariantGroups(body.variantGroups || body.variants, draftFoodType)
        : baselineVariantGroups;

    const baseline = {
        itemId: String(itemId),
        restaurantId: String(rnId),
        name: currentItem.name || raw.name || "Item",
        description: currentItem.description !== undefined ? currentItem.description : (raw.description ?? null),
        price: baselinePrice,
        markupPrice: baselineMarkup,
        imageUrl: baselineImageUrl,
        inStock: baselineInStock,
        recommended: Boolean(currentItem.recommended ?? raw.recommended ?? false),
        isFavorite: Boolean(currentItem.isFavorite ?? raw.isFavorite ?? false),
        foodType: baselineFoodType,
        gstType: currentItem.gstType || raw.gstType || "services",
        tags: currentItem.tags || raw.tags || [],
        customTags: currentItem.customTags || raw.customTags || null,
        fulfillmentModes: currentItem.fulfillmentModes || raw.fulfillmentModes || [],
        timings: currentItem.timings || raw.timings || null,
        category: catObj,
        subcategory: subcatObj,
        billComponents,
        ignoreOn,
        variantGroups: baselineVariantGroups,
        addonGroups: currentItem.addonGroups || raw.addonGroups || [],
        preparationTime: currentItem.preparationTime || raw.preparationTime || null,
    };

    const draft = {
        ...baseline,
        name: body.name !== undefined ? String(body.name).trim() : baseline.name,
        description: body.description !== undefined ? (body.description ? String(body.description).trim() : null) : baseline.description,
        price: draftPrice,
        markupPrice: draftMarkup,
        imageUrl: draftImageUrl,
        inStock: draftInStock,
        foodType: draftFoodType,
        category: catObj,
        subcategory: subcatObj,
        variantGroups: draftVariantGroups,
    };

    return {
        restaurant_id: String(rnId),
        item_id: String(itemId),
        baseline,
        draft,
    };
}

/**
 * Extracts prepared attribute values from Step 1 (/api/v1/menu/item-attributes/prepare) response components
 */
export function extractOwnlyPreparedAttributes(prepareResponse, fallbackPayload = {}) {
    const components = prepareResponse?.screen?.body?.components || prepareResponse?.data?.screen?.body?.components || [];
    const dataMap = {};
    for (const c of components) {
        if (c && c.type === "data" && c.id) {
            dataMap[c.id] = c.value;
        }
    }

    if (!dataMap.restaurant_id && !dataMap.item_id && !dataMap.update_request) {
        return null;
    }

    const restaurantId = dataMap.restaurant_id || fallbackPayload.restaurant_id;

    return {
        restaurant_id: restaurantId,
        item_id: dataMap.item_id || fallbackPayload.item_id,
        update_request: dataMap.update_request || fallbackPayload.update_request,
        price_request: dataMap.price_request !== undefined ? dataMap.price_request : (fallbackPayload.price_request ?? null),
        selected_outlets: dataMap.selected_outlets || fallbackPayload.selected_outlets || (restaurantId ? { [restaurantId]: true } : {}),
    };
}

/**
 * Builds payload for Ownly's item update endpoint:
 * POST https://rxapi.ownly.food/api/v1/menu/item-attributes
 */
export function buildOwnlyItemAttributesPayload({
    resId,
    itemId,
    currentItem = {},
    body = {},
    menuDoc = {},
}) {
    const rnId = resolveOwnlyRestaurantId({ resId, currentItem, itemId });
    const brandId = resolveOwnlyBrandId({ currentItem, menuDoc, resId: rnId });

    const itemUpdate = {
        id: String(itemId),
        gstType: currentItem?.gstType || currentItem?.raw?.gstType || "services",
    };

    // Name
    const name = body.name !== undefined ? body.name : currentItem.name;
    if (name) itemUpdate.name = String(name).trim();

    // Description
    const description = body.description !== undefined ? body.description : currentItem.description;
    if (description !== undefined && description !== null) {
        itemUpdate.description = String(description).trim();
    }

    // Food Type
    const vegVal = body.is_veg !== undefined ? body.is_veg : currentItem.is_veg;
    if (vegVal) {
        const s = String(vegVal).toUpperCase();
        itemUpdate.foodType = (s === "NON_VEG" || s === "NON-VEG") ? "non-veg" : (s === "EGG" ? "egg" : "veg");
    }

    // Image URL
    const imageUrl = body.imageUrl || body.image_url || (body.media && body.media[0]?.url) || currentItem.imageUrl || currentItem.image_url || (currentItem.media && currentItem.media[0]?.url);
    if (imageUrl) {
        itemUpdate.imageUrl = imageUrl;
    }

    // Price & Markup Price
    const price = body.price !== undefined ? body.price : (body.base_price !== undefined ? body.base_price : currentItem.price);
    if (price !== undefined && price !== null && !isNaN(Number(price))) {
        itemUpdate.price = Number(price);
        itemUpdate.markupPrice = Number(body.markupPrice ?? currentItem.markupPrice ?? 0);
    }

    // Stock / In-Stock
    if (body.inStock !== undefined || body.status !== undefined) {
        itemUpdate.inStock = Boolean(body.inStock ?? body.status);
    }

    return {
        restaurant_id: String(rnId),
        item_id: String(itemId),
        update_request: {
            brandId,
            restaurantIds: null,
            item: itemUpdate,
        },
        price_request: null,
        selected_outlets: {
            [String(rnId)]: true,
        },
    };
}

/**
 * Orchestrates the full 2-step Ownly item update flow:
 * Step 1: POST /api/v1/menu/item-attributes/prepare (extracts dynamic update_request & price_request)
 * Step 2: POST /api/v1/menu/item-attributes (submits the prepared attributes)
 * With graceful fallback to direct attributes POST or legacy PUT /api/v1/menu/item if needed.
 */
export async function executeOwnlyItemUpdate({
    req,
    accountName,
    resId,
    itemId,
    currentItem = {},
    category = null,
    subcategory = null,
    body = {},
    menuDoc = {},
}) {
    const rnId = resolveOwnlyRestaurantId({ resId, currentItem, itemId });

    // Build Step 1 prepare payload
    const preparePayload = buildOwnlyItemPreparePayload({
        resId: rnId,
        itemId,
        currentItem,
        body,
        category,
        subcategory,
    });

    // Build direct attributes fallback payload (Step 2 fallback)
    const fallbackAttributesPayload = buildOwnlyItemAttributesPayload({
        resId: rnId,
        itemId,
        currentItem,
        body,
        menuDoc,
    });

    let attributesPayload = fallbackAttributesPayload;

    // Step 1: Call prepare endpoint
    try {
        console.log(`[Ownly Item Update] Calling prepare API: /api/v1/menu/item-attributes/prepare for ${itemId}...`);
        const prepareRes = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/menu/item-attributes/prepare",
            method: "POST",
            data: preparePayload,
        });

        const extracted = extractOwnlyPreparedAttributes(prepareRes?.data, fallbackAttributesPayload);
        if (extracted && (extracted.update_request || extracted.price_request)) {
            console.log(`[Ownly Item Update] Successfully prepared attributes for ${itemId}:`, {
                update_request: extracted.update_request,
                price_request: extracted.price_request,
            });
            attributesPayload = extracted;
        } else {
            console.warn(`[Ownly Item Update] Prepare API returned unparseable structure for ${itemId}, using fallback payload.`);
        }
    } catch (prepErr) {
        console.warn(`[Ownly Item Update] /item-attributes/prepare failed (${prepErr.response?.status || prepErr.message}), proceeding with fallback payload:`, prepErr.response?.data || prepErr.message);
    }

    // Step 2: Call item-attributes endpoint
    let ownlyResponse;
    try {
        console.log(`[Ownly Item Update] Calling item-attributes API: /api/v1/menu/item-attributes for ${itemId}...`);
        ownlyResponse = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/menu/item-attributes",
            method: "POST",
            data: attributesPayload,
        });
    } catch (apiErr) {
        console.warn(`[Ownly Item Update] /item-attributes failed (${apiErr.response?.status || apiErr.message}), attempting legacy PUT /api/v1/menu/item fallback:`, apiErr.response?.data || apiErr.message);
        const legacyPayload = buildOwnlyUpdateItemPayload({
            resId: rnId,
            itemId,
            currentItem,
            category,
            subcategory,
            body,
        });
        ownlyResponse = await ownlyClient({
            req,
            accountName,
            endpoint: "/api/v1/menu/item",
            method: "PUT",
            data: legacyPayload,
        });
    }

    return {
        ownlyResponse,
        attributesPayload,
    };
}

/**
 * Builds the JSON payload for updating an item on Ownly (legacy fallback)
 */
export function buildOwnlyUpdateItemPayload({
    resId,
    itemId,
    currentItem = {},
    category = {},
    subcategory = {},
    body = {},
}) {
    const createPayload = buildOwnlyCreateItemPayload({
        resId,
        item: currentItem,
        category,
        subcategory,
        body,
    });

    return {
        itemId: String(itemId),
        ...createPayload,
    };
}

