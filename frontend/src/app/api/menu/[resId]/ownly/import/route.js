import Menu from "@/model/menu";
import Restaurant from "@/model/restaurant";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { ownlyClient } from "@/lib/api/ownly-client";

export const dynamic = "force-dynamic";

/**
 * Maps Ownly's API menu structure to the standard Menu Manager schema
 */
export function parseOwnlyMenu(rawResponse, resId) {
    const restaurantName = rawResponse?.restaurant?.name || `Ownly Restaurant #${resId}`;
    const menuData = rawResponse?.menu || {};
    const categories = Array.isArray(menuData.categories) ? menuData.categories : [];
    const variantGroups = Array.isArray(menuData.variantGroups) ? menuData.variantGroups : [];
    const variants = Array.isArray(menuData.variants) ? menuData.variants : [];

    // Index variant groups and variants by their IDs for O(1) lookup
    const vgMap = new Map(variantGroups.map((vg) => [String(vg.id || vg.providerId), vg]));
    const vMap = new Map(variants.map((v) => [String(v.id || v.providerId), v]));

    let totalItems = 0;
    let totalImages = 0;

    const parsedMenu = categories.map((cat, catIdx) => {
        const catId = String(cat.id || cat.providerId || `cat-${catIdx}`);
        const catName = cat.name?.trim() || `Category ${catIdx + 1}`;

        const parsedItems = (cat.items || []).map((item) => {
            totalItems++;

            // 1. Food type normalization
            let is_veg = "VEG";
            const ft = String(item.foodType || "").toLowerCase();
            if (ft === "egg") {
                is_veg = "EGG";
            } else if (ft.includes("non")) {
                is_veg = "NON_VEG";
            }

            // 2. Parse variant groups & options
            const itemVariants = [];
            for (const vgId of item.variantGroupIds || []) {
                const vg = vgMap.get(String(vgId));
                if (!vg) continue;

                const options = (vg.variantIds || [])
                    .map((vId) => vMap.get(String(vId)))
                    .filter(Boolean)
                    .map((v) => ({
                        option_name: v.name || "",
                        option_id: String(v.id || v.providerId || ""),
                        variant_id: String(v.id || v.providerId || ""),
                        price: Number(v.price ?? 0),
                        markupPrice: Number(v.markupPrice ?? v.price ?? 0),
                        inStock: v.inStock !== false,
                        is_default: false,
                    }))
                    .sort((a, b) => a.price - b.price);

                if (options.length > 0) {
                    options.forEach((opt, idx) => {
                        opt.is_default = idx === 0;
                    });

                    itemVariants.push({
                        property_name: vg.name?.trim() || "Variations",
                        property_id: String(vg.id || vg.providerId || ""),
                        options,
                    });
                }
            }

            // 3. Price calculation
            let basePrice = Number(item.price || 0);
            let minPrice = basePrice;
            let maxPrice = basePrice;

            if (itemVariants.length > 0) {
                const allVariantPrices = itemVariants
                    .flatMap((v) => v.options.map((o) => o.price))
                    .filter((p) => typeof p === "number" && !isNaN(p) && p >= 0);

                if (allVariantPrices.length > 0) {
                    minPrice = Math.min(...allVariantPrices);
                    maxPrice = Math.max(...allVariantPrices);
                    basePrice = minPrice;
                }
            }

            // 4. Media
            const media = [];
            if (item.imageUrl) {
                totalImages++;
                media.push({
                    url: item.imageUrl,
                    thumbUrl: item.imageUrl,
                });
            }

            return {
                id: String(item.id || item.providerId),
                temp_id: "",
                name: item.name?.trim() || "",
                description: item.description?.trim() || "",
                base_price: basePrice,
                price: basePrice,
                min_price: minPrice,
                max_price: maxPrice,
                is_veg,
                packing_charges: 0,
                media,
                variants: itemVariants,
                addons: [],
                status: item.inStock !== false,
                inStock: item.inStock !== false,
                raw: item,
            };
        });

        return {
            id: catId,
            temp_id: "",
            name: catName,
            sortOrder: cat.sortOrder ?? catIdx,
            sub_category: [
                {
                    id: `sub-${catId}`,
                    temp_id: "",
                    name: catName,
                    items: parsedItems,
                },
            ],
        };
    });

    return {
        restaurantName,
        parsedMenu,
        totalItems,
        totalImages,
    };
}

async function handleImport(req, resId) {
    if (!resId) {
        return NextResponse.json(
            { success: false, message: "Restaurant ID is required." },
            { status: 400 }
        );
    }

    try {
        await dbConnect();

        // 1. Fetch live menu from Ownly API
        const ownlyResponse = await ownlyClient({
            req,
            endpoint: `/api/v1/menu?restaurant-id=${encodeURIComponent(resId)}`,
            method: "GET",
        });

        const rawData = ownlyResponse.data;
        if (!rawData?.menu) {
            throw new Error(rawData?.message || "Invalid or empty menu received from Ownly API.");
        }

        // 2. Parse into Menu Manager standard format
        const { restaurantName, parsedMenu, totalItems, totalImages } = parseOwnlyMenu(rawData, resId);

        // 3. Upsert into MongoDB Menu collection
        const updatedMenuDoc = await Menu.findOneAndUpdate(
            { resId: String(resId), platform: "ownly" },
            {
                resId: String(resId),
                platform: "ownly",
                name: restaurantName,
                menu: parsedMenu,
                addons: [],
            },
            { upsert: true, new: true }
        );

        // 4. Also update Restaurant metadata if exists
        try {
            await Restaurant.findOneAndUpdate(
                { resId: String(resId) },
                {
                    name: restaurantName,
                    platform: "ownly",
                },
                { upsert: true }
            );
        } catch (rErr) {
            console.warn("Could not upsert Restaurant record:", rErr.message);
        }

        return NextResponse.json({
            success: true,
            message: "Menu imported successfully from Ownly",
            data: updatedMenuDoc,
            total_items: totalItems,
            stats: {
                items: totalItems,
                totalImagesFound: totalImages,
                categories: parsedMenu.length,
            },
        });
    } catch (err) {
        console.error("Ownly Menu Import Error:", err.response?.data || err.message);
        return NextResponse.json(
            {
                success: false,
                message: err.response?.data?.message || err.message || "Failed to import Ownly menu.",
            },
            { status: err.response?.status || 500 }
        );
    }
}

export async function GET(req, { params }) {
    const { resId } = await params;
    return handleImport(req, resId);
}

export async function POST(req, { params }) {
    const { resId } = await params;
    return handleImport(req, resId);
}

