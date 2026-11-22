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
        const { res_id_to, sourceMenu, platform_from = "ownly", platform_to = "ownly" } = await req.json();

        if (!res_id_to) {
            return NextResponse.json(
                { success: false, message: "Target restaurant ID (res_id_to) is required." },
                { status: 400 }
            );
        }

        let originalMenu = [];
        if (sourceMenu && Array.isArray(sourceMenu) && sourceMenu.length > 0) {
            originalMenu = sourceMenu;
        } else {
            const menu = await Menu.findOne({ resId: String(resId), platform: platform_from });
            if (!menu) {
                return NextResponse.json(
                    { success: false, message: "Source menu not found." },
                    { status: 404 }
                );
            }
            originalMenu = menu?.menu || [];
        }

        // Deep clone and regenerate all IDs as temp-
        const newMenu = regenerateIds(originalMenu);

        // Standardize structure for Ownly: ensure every category has sub_category
        for (const cat of newMenu) {
            cat.temp_id = cat.id;
            if (!Array.isArray(cat.sub_category)) {
                cat.sub_category = cat.sub_categories || [];
            }
            for (const sub of cat.sub_category) {
                sub.temp_id = sub.id;
                for (const item of sub.items || []) {
                    item.temp_id = item.id;
                    item.inStock = item.inStock !== false && item.status !== false;
                }
            }
        }

        const menuToUpdate = await Menu.findOne({ resId: String(res_id_to), platform: platform_to });

        if (!menuToUpdate) {
            await Menu.create({
                resId: String(res_id_to),
                platform: platform_to,
                menu: newMenu,
            });
        } else {
            const existingMenu = menuToUpdate.menu || [];

            // Merge: for each incoming category, either append or merge into matching existing category
            for (const incomingCat of newMenu) {
                const matchingCat = existingMenu.find(
                    (c) => c.name?.toLowerCase().trim() === incomingCat.name?.toLowerCase().trim()
                );

                if (!matchingCat) {
                    existingMenu.push(incomingCat);
                } else {
                    const incomingSubs = incomingCat.sub_category || incomingCat.sub_categories || [];
                    for (const incomingSub of incomingSubs) {
                        const matchingSub = (matchingCat.sub_category || matchingCat.sub_categories || []).find(
                            (s) => s.name?.toLowerCase().trim() === incomingSub.name?.toLowerCase().trim()
                        );

                        if (!matchingSub) {
                            matchingCat.sub_category = matchingCat.sub_category || matchingCat.sub_categories || [];
                            matchingCat.sub_category.push(incomingSub);
                        } else {
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
                success: true,
                message: "Menu transferred to Ownly successfully.",
                data: {
                    resId,
                    res_id_to,
                },
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Error in Ownly transfer API:", err);
        return NextResponse.json(
            {
                success: false,
                message: err?.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
};

