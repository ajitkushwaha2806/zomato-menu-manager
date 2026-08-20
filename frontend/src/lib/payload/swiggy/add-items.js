import merge from "lodash.merge";

export const variantGroups = (
    variants = [],
    basePrice = 0,
    is_veg = "VEG"
) =>
    variants
        .filter(
            (group) =>
                group?.property_name &&
                Array.isArray(group.options) &&
                group.options.length > 0
        )
        .map((group) => ({
            variant_group: {
                name: group.property_name,
            },

            variants_vo: group.options.map(
                (
                    {
                        option_name,
                        price = 0,
                        inStock = true,
                        default: isDefault = false,
                    },
                    index
                ) => ({
                    variant: {
                        name: option_name,

                        // Swiggy expects variant price as delta from item price
                        price: Math.max(
                            0,
                            Number(price) - Number(basePrice)
                        ),

                        in_stock: inStock ? 1 : 0,
                        ...(is_veg !== "NONE" ? { is_veg: is_veg } : {}),
                        default: isDefault || index === 0 ? 1 : 0,
                    },
                })
            ),
        }));

export function buildItemPayload({
    name,
    description = "",
    price = 0,
    base_price = 0,
    is_veg = "VEG",
    image_url = "",
    image_id = null,
    categoryId,
    categoryName,
    subCategoryId,
    subCategoryName,
    packingCharges = 0,
    packing_charges = 0,
    media = [],
    variants = [],
    addonGroups = [],
    inStock = true,
    enabled = true,
    discoverable = false,
    order = 0,
}) {
    const finalImageUrl = image_url || (media && media.length > 0 ? (media[0].url || media[0].utl) : null) || null;
    const finalImageId = image_id || (media && media.length > 0 ? (media[0].mediaId || media[0].imageId || media[0].id) : null) || null;
    const finalPackingCharges = packing_charges !== undefined && packing_charges !== 0 ? packing_charges : packingCharges;

    return {
        insightMappings: null,
        item_vo: {
            quantity: null,
            recommended: null,
            serves_how_many: null,
            is_spicy: null,
            preparation_style: null,
            serves_how_many_upper_limit: null,
            spice_level: null,
            cutlery: null,
            sweet_level: null,
            bone_property: null,
            gravy_property: null,
            contain_seasonal_ingredients: null,
            allergen_info: null,
            packaging: null,
            accompaniments: null,

            item: {
                id: null,
                name,
                is_veg,
                description,
                price: price || base_price,
                packing_charges: finalPackingCharges,
                image_url: finalImageUrl,
                image_id: finalImageId,

                gst_details: {
                    sgst: "[SUBTOTAL]*0.025",
                    cgst: "[SUBTOTAL]*0.025",
                    igst: "[SUBTOTAL]*0.0",
                    gst_liability: "SWIGGY",
                    inclusive: false,
                },
            },

            item_slot: [],
            in_stock: inStock,
            packing_slab_count: 0,
            is_discoverable: discoverable,
            order,
            enabled: enabled ? 1 : 0,

            main_category_id: categoryId,
            sub_category_id: subCategoryId,

            eligible_for_long_distance: 0,

            variant_groups_vo: variantGroups(
                variants,
                price || base_price,
                is_veg
            ),

            addon_groups_vo: [],

            main_category_name: categoryName,
            sub_category_name: subCategoryName,
        },
    };
}

export function buildItemUpdatePayload(source, updates = {}) {
    if (updates.base_price !== undefined) {
        updates.price = updates.base_price;
    }
    const payload = {
        insightMappings: null,

        item_vo: {
            quantity: source.item?.catalog_attributes?.quantity ?? null,
            recommended: source.item?.recommended ?? null,
            serves_how_many:
                source.item?.catalog_attributes?.serves_how_many ?? null,

            is_spicy: source.item?.is_spicy ?? null,
            preparation_style: source.item?.preparation_style ?? null,

            serves_how_many_upper_limit:
                source.item?.catalog_attributes?.serves_how_many_upper_limit ??
                null,

            spice_level:
                source.item?.catalog_attributes?.spice_level ?? null,

            cutlery:
                source.item?.catalog_attributes?.cutlery ?? null,

            sweet_level:
                source.item?.catalog_attributes?.sweet_level ?? null,

            bone_property:
                source.item?.catalog_attributes?.bone_property ?? null,

            gravy_property:
                source.item?.catalog_attributes?.gravy_property ?? null,

            contain_seasonal_ingredients:
                source.item?.catalog_attributes
                    ?.contain_seasonal_ingredients ?? null,

            allergen_info:
                source.item?.catalog_attributes?.allergen_info ?? null,

            packaging:
                source.item?.catalog_attributes?.packaging ?? null,

            accompaniments:
                source.item?.catalog_attributes?.accompaniments ?? null,

            item: {
                id: source.item?.id,
                name: source.item?.name,
                is_veg: source.item?.is_veg,
                description: source.item?.description,
                price: source.item?.price,
                packing_charges: source.item?.packing_charges ?? 0,
                image_url: source.item?.image_url,
                image_id: source.item?.image_id ?? null,
                gst_details: source.item?.gst_details,
            },

            item_slot: source.item_slot ?? [],

            in_stock: Boolean(source.item?.in_stock),

            packing_slab_count:
                source.item?.packing_slab_count ?? 0,

            is_discoverable:
                source.item?.is_discoverable ?? true,

            order: source.item?.order ?? 0,

            enabled: source.item?.enabled ?? 1,

            main_category_id: source.main_category_id,
            sub_category_id: source.sub_category_id,

            eligible_for_long_distance:
                source.item?.eligible_for_long_distance ?? 1,

            variant_groups_vo:
                source.variant_groups_vo ?? [],

            addon_groups_vo:
                source.addon_groups_vo ?? [],

            main_category_name:
                source.main_category_name,

            sub_category_name:
                source.sub_category_name,
        },
    };

    const allowedUpdates = {
        item_vo: {
            item: {},
        },
    };

    const itemFields = [
        "name",
        "is_veg",
        "description",
        "price",
        "packing_charges",
        "image_url",
        "image_id",
    ];

    for (const field of itemFields) {
        if (updates[field] !== undefined) {
            allowedUpdates.item_vo.item[field] =
                updates[field];
        }
    }

    if (updates.media !== undefined) {
        if (Array.isArray(updates.media) && updates.media.length > 0) {
            const m = updates.media[0];
            const url = typeof m === 'string' ? m : (m.url || m.utl);
            const imgId = typeof m === 'string' ? null : (m.imageId || m.mediaId || m.id || null);
            if (url) allowedUpdates.item_vo.item.image_url = url;
            if (imgId) allowedUpdates.item_vo.item.image_id = imgId;
        } else if (Array.isArray(updates.media) && updates.media.length === 0) {
            allowedUpdates.item_vo.item.image_url = null;
            allowedUpdates.item_vo.item.image_id = null;
        }
    }

    const rootFields = [
        "in_stock",
        "enabled",
        "is_discoverable",
        "order",
        "recommended",
        "is_spicy",
        "preparation_style",
        "quantity",
        "serves_how_many",
        "spice_level",
        "cutlery",
        "sweet_level",
        "bone_property",
        "gravy_property",
        "allergen_info",
        "packaging",
        "accompaniments",
        "packing_slab_count",
        "eligible_for_long_distance",
    ];

    for (const field of rootFields) {
        if (updates[field] !== undefined) {
            allowedUpdates.item_vo[field] =
                updates[field];
        }
    }

    if (updates.variant_groups_vo !== undefined) {
        allowedUpdates.item_vo.variant_groups_vo =
            updates.variant_groups_vo;
    }

    if (Array.isArray(updates.variants)) {
        const itemPrice =
            updates.price ??
            updates.base_price ??
            source.item?.price ??
            0;

        // Swiggy's variant_groups_vo contains the original variants with IDs.
        // updates.variants is from our DB and doesn't have Swiggy IDs.
        // We construct a new variant_groups_vo that retains the IDs from source.
        const updatedVariantGroups = JSON.parse(JSON.stringify(source.variant_groups_vo || []));

        if (updatedVariantGroups.length === 0 && updates.variants.length > 0) {
            allowedUpdates.item_vo.variant_groups_vo = variantGroups(
                updates.variants,
                itemPrice,
                updates.is_veg ?? source.item?.is_veg
            );
        } else {
            updatedVariantGroups.forEach((group) => {
                const groupName = group.variant_group?.name || group.name;
                const matchedGroup = updates.variants.find((vg) => vg.property_name === groupName);

                if (matchedGroup && Array.isArray(matchedGroup.options)) {
                    group.variants_vo?.forEach((opt) => {
                        const optName = opt.variant?.name;
                        const matchedOpt = matchedGroup.options.find((o) => o.option_name === optName);

                        if (opt.variant.is_veg === "NONE") {
                            delete opt.variant.is_veg;
                        }
                        if (matchedOpt) {
                            opt.variant.price = Math.max(0, Number(matchedOpt.price) - Number(itemPrice));
                            if (matchedOpt.inStock !== undefined) {
                                opt.variant.in_stock = matchedOpt.inStock ? 1 : 0;
                            }
                            if (matchedOpt.is_default !== undefined) {
                                opt.variant.default = (matchedOpt.is_default || matchedOpt.default) ? 1 : 0;
                            }
                        }
                    });
                }
            });
            allowedUpdates.item_vo.variant_groups_vo = updatedVariantGroups;
        }
    }

    if (updates.addon_groups_vo !== undefined) {
        allowedUpdates.item_vo.addon_groups_vo =
            updates.addon_groups_vo;
    }

    return merge(payload, allowedUpdates);
}