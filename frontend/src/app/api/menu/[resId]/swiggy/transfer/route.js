import { NextResponse } from "next/server";
import Menu from "@/model/menu";
import crypto from "crypto";
import dbConnect from "@/lib/dbConnect";

function regenerateIds(obj) {
    if (Array.isArray(obj)) {
        return obj.map(regenerateIds);
    } else if (obj !== null && typeof obj === "object") {
        const newObj = {};
        for (const [key, value] of Object.entries(obj)) {
            let targetKey = key;
            
            // Rename "id" to "tempReferenceId" for media objects
            if (key === "id" && obj.mediaType) {
                targetKey = "tempReferenceId";
            }

            if (["id", "category_id", "sub_category_id", "item_id", "variant_id", "option_id", "property_id", "tempReferenceId"].includes(targetKey)) {
                newObj[targetKey] = `temp-${crypto.randomUUID()}`;
            } else {
                newObj[targetKey] = regenerateIds(value);
            }
        }
        return newObj;
    }
    return obj;
}

export const POST = async (req, { params }) => {
    try {
        await dbConnect();
        const { resId } = await params;
        const { res_id_to, sourceMenu } = await req.json();

        if (!res_id_to) {
            return NextResponse.json(
                { message: "res_id_to is required." },
                { status: 400 }
            );
        }

        let originalMenu = [];
        if (sourceMenu) {
            originalMenu = sourceMenu;
        } else {
            const menu = await Menu.findOne({ resId: resId, platform: 'swiggy' });
            if (!menu) {
                return NextResponse.json(
                    { message: "Menu not found." },
                    { status: 404 }
                );
            }
            originalMenu = menu?.menu || [];
        }

        // Deep clone and regenerate all IDs
        const newMenu = regenerateIds(originalMenu);

        // Apply transformations for Swiggy
        for (const cat of newMenu) {
            const isBeverageCat = cat.name?.toLowerCase().includes("beverage") || cat.name?.toLowerCase().includes("drink");
            for (const sub of cat.sub_category || cat.sub_categories || []) {
                const isBeverageSub = sub.name?.toLowerCase().includes("beverage") || sub.name?.toLowerCase().includes("drink");
                for (const item of sub.items || []) {
                    const titleLower = item.name?.toLowerCase() || "";
                    
                    if (titleLower.includes("pizza") && !titleLower.includes("inch")) {
                        item.name = `${item.name} - [6 INCH]`;
                    }
                    
                    if (titleLower.includes("chaap") && !(item.description || "").toLowerCase().includes("mock meat")) {
                        item.description = `${item.description || ""} - [Mock Meat]`.trim();
                        if (item.description.startsWith("- ")) item.description = item.description.substring(2);
                    }
                    
                    if ((isBeverageCat || isBeverageSub || titleLower.match(/(shake|lassi|mojito|coke|pepsi|juice)/)) && !(item.description || "").toLowerCase().match(/\bml\b/)) {
                        item.description = `${item.description || ""} - [200 ML]`.trim();
                        if (item.description.startsWith("- ")) item.description = item.description.substring(2);
                    }
                }
            }
        }

        const menuToUpdate = await Menu.findOne({ resId: res_id_to, platform: 'swiggy' });

        if (!menuToUpdate) {
            await Menu.create({
                resId: res_id_to,
                platform: 'swiggy',
                menu: newMenu
            });
        } else {
            const existingMenu = menuToUpdate.menu || [];

            // Merge: for each incoming category, either append or merge into matching existing category
            for (const incomingCat of newMenu) {
                const matchingCat = existingMenu.find(
                    (c) => c.name?.toLowerCase().trim() === incomingCat.name?.toLowerCase().trim()
                );

                if (!matchingCat) {
                    // Brand-new category — append it wholesale
                    existingMenu.push(incomingCat);
                } else {
                    // Category already exists — merge sub-categories
                    for (const incomingSub of incomingCat.sub_category || incomingCat.sub_categories || []) {
                        const matchingSub = (matchingCat.sub_category || matchingCat.sub_categories || []).find(
                            (s) => s.name?.toLowerCase().trim() === incomingSub.name?.toLowerCase().trim()
                        );

                        if (!matchingSub) {
                            // New sub-category — append it
                            matchingCat.sub_category = matchingCat.sub_category || matchingCat.sub_categories || [];
                            matchingCat.sub_category.push(incomingSub);
                        } else {
                            // Sub-category exists — append items that don't already exist (by name)
                            const existingItemNames = new Set(
                                (matchingSub.items || []).map((i) => i.name?.toLowerCase().trim())
                            );
                            for (const item of incomingSub.items || []) {
                                if (!existingItemNames.has(item.name?.toLowerCase().trim())) {
                                    matchingSub.items = matchingSub.items || [];
                                    matchingSub.items.push(item);
                                    existingItemNames.add(item.name?.toLowerCase().trim());
                                }
                            }
                        }
                    }
                }
            }

            menuToUpdate.menu = existingMenu;
            menuToUpdate.markModified("menu");
            await menuToUpdate.save();

        }

        return NextResponse.json(
            {
                message: "Menu transferred successfully.",
                data: {
                    resId,
                    res_id_to,
                },
            },
            { status: 200 }
        );
    } catch (err) {
        return NextResponse.json(
            {
                message: err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
};