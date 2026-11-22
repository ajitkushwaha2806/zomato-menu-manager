import crypto from "crypto";

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
 * Builds the exact JSON payload for updating an item on Ownly:
 * PUT https://rxapi.ownly.food/api/v1/menu/item
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

