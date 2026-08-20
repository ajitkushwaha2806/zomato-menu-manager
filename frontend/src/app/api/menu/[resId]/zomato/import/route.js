import Menu from "@/model/menu"
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";

export const dynamic = "force-dynamic";

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

const parseItemVariants = (catalogueWrapper) => {
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

                options: values.map((value, index) => {
                    const matched =
                        propertyValueToVariant.get(value?.propertyValueId) ||
                        {};

                    return {
                        option_name: value?.value || "",
                        option_id: value?.propertyValueId || "",
                        variant_id: matched?.variantId || "",
                        price: matched?.price || 0,
                    };
                }).sort((a, b) => a.price - b.price).map((opt, i) => {
                    opt.is_default = (i === 0);
                    return opt;
                }),
            };
        })
        .filter(Boolean);
};

const buildItem = (catalogueWrapper, onHoldItems = {}) => {
    const catalogue = catalogueWrapper?.catalogue || {};
    const tags = catalogueWrapper?.catalogueTags || [];
    let base_price = getBasePrice(catalogueWrapper?.variantWrappers);

    const catalogueId = catalogue?.catalogueId || "";
    const holdData = onHoldItems?.catalogues?.[catalogueId];

    const parsedVariants = parseItemVariants(catalogueWrapper);

    // If item has variants, ensure base_price equals the lowest variant option price
    if (parsedVariants && parsedVariants.length > 0) {
        let lowestPrice = Infinity;
        parsedVariants.forEach(v => {
            v.options?.forEach(opt => {
                if (opt.price > 0 && opt.price < lowestPrice) {
                    lowestPrice = opt.price;
                }
            });
        });
        if (lowestPrice !== Infinity) {
            base_price = lowestPrice;
        }

        // Sort variant groups themselves by their lowest option price
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
        is_veg: tags.includes("egg") ? "EGG" : tags.includes("non-veg") ? "NON_VEG" : "VEG",
        packing_charges: 0,
        media: catalogue?.media || [],
        variants: parsedVariants,
        meatTypes: catalogue?.meatTypes,
        onHold: !!holdData,
        holdComments: holdData?.comments || [],
        addons: [] // Populated later
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
                    .map(cw => buildItem(cw, onHoldItems));

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
                    variant: vw
                });
            }
        });
    });

    const parsedAddons = modifierGroupWrappers
        .filter(groupWrapper => !groupWrapper?.modifierGroup?.excludeFromGlobal)
        .map(groupWrapper => {
            const mg = groupWrapper?.modifierGroup || {};

            const options = (groupWrapper?.variantModifierGroupMaps || []).map(map => {
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
                    map_id: map.id
                };
            }).filter(Boolean);

            return {
                id: mg.modifierGroupId,
                name: mg.name || "",
                min: mg.min || 0,
                max: mg.max || 1,
                is_compulsory: (mg.min || 0) > 0,
                allow_multiple: mg.maxSelectionsPerItem > 1,
                max_per_item: mg.maxSelectionsPerItem || 1,
                options: options
            };
        });

    const validAddonIds = new Set(parsedAddons.map(a => a.id));

    catalogueWrappers.forEach(wrapper => {
        const itemAddonIds = new Set();

        wrapper?.variantWrappers?.forEach(vw => {
            vw?.variantModifierGroupMaps?.forEach(map => {
                if (map.variantIsParent && map.modifierGroupId && validAddonIds.has(map.modifierGroupId)) {
                    itemAddonIds.add(map.modifierGroupId);
                }
            });
        });

        if (itemAddonIds.size > 0) {
            // Find this item in parsedMenu and attach addons
            parsedMenu.forEach(cat => {
                cat.sub_category?.forEach(sub => {
                    const item = sub.items?.find(i => i.id === wrapper.catalogue?.catalogueId);
                    if (item) {
                        item.addons = Array.from(itemAddonIds);
                    }
                });
            });
        }
    });

    return { parsedMenu, parsedAddons };
};

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

        const onHoldItems = result?.data?.onHoldItems ?? result?.data?.menuResponse?.onHoldItems ?? {};
        console.log("onHoldItems", onHoldItems)

        const { parsedMenu, parsedAddons } = parseZomatoCatalogueMenu(menu, onHoldItems);

        const savedMenu = await Menu.findOneAndUpdate(
            { resId, platform: "zomato" },
            {
                $set: {
                    resId,
                    platform: "zomato",
                    menu: parsedMenu,
                    addons: parsedAddons,
                    updatedAt: new Date()
                }
            },
            { new: true, upsert: true }
        );

        return NextResponse.json(
            {
                success: true,
                message: "Menu fetched successfully",
                data: savedMenu,
                parsedAddons: parsedAddons,
                result: result
            },
            { status: 200 }
        );
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                message: err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}