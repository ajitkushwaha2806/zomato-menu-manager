import dbConnect from "@/lib/dbConnect";
import MenuUploadJob from "@/model/menu-upload-job";
import Menu from "@/model/menu";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function generateTempId() {
    return `temp-${crypto.randomUUID()}`;
}

function cleanPrice(priceVal) {
    if (typeof priceVal === "number") return priceVal;
    if (!priceVal) return 0;
    const cleaned = String(priceVal).replace(/[^\d.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

// Convert any queue chain outputs into standard menu category hierarchy with temp- IDs
function extractMenuFromJob(job) {
    const chainOutputs = job?.chain_outputs || {};
    const normalizedMenu = chainOutputs.normalized_menu;
    const mergedItems = chainOutputs.merged_items;
    const parsedMenus = chainOutputs.parsed_menus;

    const formattedCategories = [];

    if (normalizedMenu && Array.isArray(normalizedMenu.category) && normalizedMenu.category.length > 0) {
        for (const cat of normalizedMenu.category) {
            const catName = (cat.name || "General").trim();
            const subCategories = [];

            const rawSubCats = Array.isArray(cat.sub_category) ? cat.sub_category : [];
            
            // If category has direct items without sub_category
            if (rawSubCats.length === 0 && Array.isArray(cat.items) && cat.items.length > 0) {
                rawSubCats.push({
                    name: catName,
                    items: cat.items,
                });
            }

            for (const sub of rawSubCats) {
                const subName = (sub.name || catName).trim();
                const items = [];

                for (const rawItem of sub.items || []) {
                    const variants = (rawItem.variants || []).map((vg) => ({
                        property_name: vg.property_name || vg.name || "Variant",
                        property_id: generateTempId(),
                        options: (vg.options || []).map((opt, optIdx) => ({
                            option_name: opt.option_name || opt.name || `Option ${optIdx + 1}`,
                            option_id: generateTempId(),
                            variant_id: generateTempId(),
                            price: cleanPrice(opt.price),
                            is_default: Boolean(opt.is_default !== undefined ? opt.is_default : optIdx === 0),
                        })),
                    }));

                    let basePrice = cleanPrice(rawItem.base_price || rawItem.price || 0);
                    if (variants.length > 0 && basePrice === 0) {
                        const optPrices = variants.flatMap((v) => v.options.map((o) => o.price)).filter((p) => p > 0);
                        if (optPrices.length > 0) {
                            basePrice = Math.min(...optPrices);
                        }
                    }

                    items.push({
                        id: generateTempId(),
                        temp_id: "",
                        name: (rawItem.name || "Unnamed Item").trim(),
                        category: catName,
                        sub_category: subName,
                        is_veg: rawItem.is_veg || "VEG",
                        meat_types: rawItem.meat_types || rawItem.meatTypes || [],
                        base_price: basePrice,
                        description: rawItem.description || null,
                        variants: variants,
                        addons: rawItem.addons || [],
                        media: rawItem.media || [],
                        packing_charges: rawItem.packing_charges || 0,
                    });
                }

                if (items.length > 0) {
                    subCategories.push({
                        id: generateTempId(),
                        temp_id: "",
                        name: subName,
                        items: items,
                    });
                }
            }

            if (subCategories.length > 0) {
                formattedCategories.push({
                    id: generateTempId(),
                    temp_id: "",
                    name: catName,
                    sub_category: subCategories,
                });
            }
        }
    } else if (mergedItems && Array.isArray(mergedItems.items) && mergedItems.items.length > 0) {
        // Build categories from merged items
        const catMap = new Map();

        for (const rawItem of mergedItems.items) {
            const catName = (rawItem.category || "General").trim();
            const subName = (rawItem.sub_category || catName).trim();

            if (!catMap.has(catName)) {
                catMap.set(catName, new Map());
            }
            const subMap = catMap.get(catName);
            if (!subMap.has(subName)) {
                subMap.set(subName, []);
            }

            const variants = (rawItem.variants || []).map((vg) => ({
                property_name: vg.property_name || vg.name || "Variant",
                property_id: generateTempId(),
                options: (vg.options || []).map((opt, optIdx) => ({
                    option_name: opt.option_name || opt.name || `Option ${optIdx + 1}`,
                    option_id: generateTempId(),
                    variant_id: generateTempId(),
                    price: cleanPrice(opt.price),
                    is_default: Boolean(opt.is_default !== undefined ? opt.is_default : optIdx === 0),
                })),
            }));

            subMap.get(subName).push({
                id: generateTempId(),
                temp_id: "",
                name: (rawItem.name || "Unnamed Item").trim(),
                category: catName,
                sub_category: subName,
                is_veg: rawItem.is_veg || "VEG",
                meat_types: rawItem.meat_types || rawItem.meatTypes || [],
                base_price: cleanPrice(rawItem.base_price || rawItem.price || 0),
                description: rawItem.description || null,
                variants: variants,
                addons: rawItem.addons || [],
                media: rawItem.media || [],
                packing_charges: rawItem.packing_charges || 0,
            });
        }

        for (const [catName, subMap] of catMap.entries()) {
            const subCategories = [];
            for (const [subName, items] of subMap.entries()) {
                subCategories.push({
                    id: generateTempId(),
                    temp_id: "",
                    name: subName,
                    items: items,
                });
            }
            formattedCategories.push({
                id: generateTempId(),
                temp_id: "",
                name: catName,
                sub_category: subCategories,
            });
        }
    } else if (Array.isArray(parsedMenus) && parsedMenus.length > 0) {
        const catMap = new Map();

        for (const pm of parsedMenus) {
            for (const rawItem of pm.items || []) {
                const catName = (rawItem.category || "General").trim();
                const subName = (rawItem.sub_category || catName).trim();

                if (!catMap.has(catName)) {
                    catMap.set(catName, new Map());
                }
                const subMap = catMap.get(catName);
                if (!subMap.has(subName)) {
                    subMap.set(subName, []);
                }

                subMap.get(subName).push({
                    id: generateTempId(),
                    temp_id: "",
                    name: (rawItem.name || "Unnamed Item").trim(),
                    category: catName,
                    sub_category: subName,
                    is_veg: rawItem.is_veg || "VEG",
                    meat_types: rawItem.meat_types || rawItem.meatTypes || [],
                    base_price: cleanPrice(rawItem.base_price || rawItem.price || 0),
                    description: rawItem.description || null,
                    variants: [],
                    addons: [],
                    media: [],
                    packing_charges: 0,
                });
            }
        }

        for (const [catName, subMap] of catMap.entries()) {
            const subCategories = [];
            for (const [subName, items] of subMap.entries()) {
                subCategories.push({
                    id: generateTempId(),
                    temp_id: "",
                    name: subName,
                    items: items,
                });
            }
            formattedCategories.push({
                id: generateTempId(),
                temp_id: "",
                name: catName,
                sub_category: subCategories,
            });
        }
    }

    return formattedCategories;
}

export async function POST(request, { params }) {
    try {
        await dbConnect();
        const { jobId } = await params;
        const body = await request.json().catch(() => ({}));

        if (!jobId) {
            return NextResponse.json(
                { success: false, message: "Job ID is required" },
                { status: 400 }
            );
        }

        const job = await MenuUploadJob.findOne({
            $or: [{ job_id: jobId }, { _id: jobId.match(/^[0-9a-fA-F]{24}$/) ? jobId : null }],
        }).lean();

        if (!job) {
            return NextResponse.json(
                { success: false, message: "Job not found" },
                { status: 404 }
            );
        }

        const newCategories = extractMenuFromJob(job);

        if (newCategories.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No parsed menu items found in this queue to append.",
                },
                { status: 400 }
            );
        }

        const targetResId = (body.targetResId || body.restaurant_id || job.restaurant_id || "").trim();
        const targetPlatform = (body.platform || job.platform || "zomato").toLowerCase().trim();

        if (!targetResId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Target restaurant ID is required to append menu items.",
                },
                { status: 400 }
            );
        }

        let menuDoc = await Menu.findOne({ resId: targetResId, platform: targetPlatform });
        if (!menuDoc) {
            menuDoc = await Menu.create({
                resId: targetResId,
                platform: targetPlatform,
                menu: [],
                addons: [],
            });
        }

        const existingMenu = Array.isArray(menuDoc.menu) ? menuDoc.menu : [];
        let appendedCategoriesCount = 0;
        let appendedItemsCount = 0;

        for (const newCat of newCategories) {
            const matchingCat = existingMenu.find(
                (c) =>
                    c.name?.toLowerCase().trim() === newCat.name?.toLowerCase().trim() &&
                    c.status !== "delete" &&
                    c.status !== "deleted"
            );

            if (!matchingCat) {
                // Brand new category - append wholesale
                existingMenu.push(newCat);
                appendedCategoriesCount++;
                (newCat.sub_category || []).forEach((sub) => {
                    appendedItemsCount += (sub.items || []).length;
                });
            } else {
                // Category exists - merge subcategories
                matchingCat.sub_category = matchingCat.sub_category || [];

                for (const newSub of newCat.sub_category || []) {
                    const matchingSub = matchingCat.sub_category.find(
                        (s) =>
                            s.name?.toLowerCase().trim() === newSub.name?.toLowerCase().trim() &&
                            s.status !== "delete" &&
                            s.status !== "deleted"
                    );

                    if (!matchingSub) {
                        // Subcategory does not exist - append subcategory
                        matchingCat.sub_category.push(newSub);
                        appendedItemsCount += (newSub.items || []).length;
                    } else {
                        // Subcategory exists - simply append the items with new temp IDs
                        matchingSub.items = matchingSub.items || [];
                        matchingSub.items.push(...(newSub.items || []));
                        appendedItemsCount += (newSub.items || []).length;
                    }
                }
            }
        }

        menuDoc.menu = existingMenu;
        menuDoc.markModified("menu");
        await menuDoc.save();

        return NextResponse.json({
            success: true,
            message: `Successfully appended ${appendedItemsCount} items across ${newCategories.length} categories to restaurant ${targetResId} (${targetPlatform}).`,
            data: {
                targetResId,
                platform: targetPlatform,
                appendedCategoriesCount,
                appendedItemsCount,
                totalCategories: existingMenu.length,
                menu: existingMenu,
            },
        });
    } catch (error) {
        console.error("Error appending menu from job:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to append menu from queue job",
            },
            { status: 500 }
        );
    }
}
