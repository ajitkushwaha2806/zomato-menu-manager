import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function isJunkDescription(desc, itemName) {
    if (!desc || typeof desc !== "string") return true;
    const d = desc.trim();
    if (!d) return true;
    if (/^\d+$/.test(d)) return true; // e.g. "14", "13", "10", "9"
    if (/^~\d+$/.test(d)) return true; // e.g. "~14", "~9"
    if (d.length <= 3) return true;
    if (itemName && d.toLowerCase() === itemName.trim().toLowerCase()) return true; // e.g. "Cheese Burger"
    if (/^(wrap|burger|fries|sandwich|roll|bowl|bucket|meal)\s*\+\s*\d*/i.test(d)) return true;
    if (/^french fries\s*\+\s*\d*\s*cold drink/i.test(d)) return true;
    if (/^\[regular\]/i.test(d)) return true;
    if (/^\+\s*\d+/i.test(d)) return true;
    if (/cold drink\s*\([sml]\)/i.test(d) && !/combo|platter|thali|meal/i.test(itemName || "")) return true;
    return false;
}

function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (insideQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuotes = false;
                }
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                insideQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentCell);
                currentCell = "";
            } else if (char === '\r') {
                if (nextChar === '\n') i++;
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = "";
            } else if (char === '\n') {
                currentRow.push(currentCell);
                rows.push(currentRow);
                currentRow = [];
                currentCell = "";
            } else {
                currentCell += char;
            }
        }
    }

    if (currentRow.length > 0 || currentCell !== "") {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

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

        // 1. Fetch current session to determine restaurantName and active platform
        let sessionMe = null;
        try {
            sessionMe = await petpoojaClient({
                req,
                endpoint: "/api/v1/session/me",
                method: "GET",
            });
        } catch (sessErr) {
            console.warn("Could not check /api/v1/session/me:", sessErr.message);
        }

        let restaurantName = `Petpooja Outlet (${resId})`;
        const currentSessionResId = sessionMe?.data?.restaurantId ? String(sessionMe.data.restaurantId) : null;

        // ONLY select restaurant if session is currently on a different restaurant
        if (currentSessionResId && currentSessionResId !== String(resId)) {
            try {
                const selectRes = await petpoojaClient({
                    req,
                    endpoint: "/api/v1/restaurants/select",
                    method: "POST",
                    data: { restaurant_id: String(resId) },
                });
                if (selectRes?.data?.name) {
                    restaurantName = selectRes.data.name;
                }
            } catch (selErr) {
                console.warn("Could not execute /api/v1/restaurants/select:", selErr.message);
            }
        }

        // Note: The UI outlet selector already selects the platform via /api/v1/menu/platforms/select.
        // We do not re-hit platforms/select here so we don't cause redundant API calls or session conflicts.

        // 3. Fetch Categories
        let categories = [];
        try {
            const catResp = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/categories",
                method: "GET",
            });
            categories = Array.isArray(catResp?.data?.data)
                ? catResp.data.data
                : (Array.isArray(catResp?.data?.categories)
                    ? catResp.data.categories
                    : (Array.isArray(catResp?.data) ? catResp.data : []));
        } catch (catErr) {
            console.warn("Failed to fetch Petpooja categories:", catErr.message);
        }

        // 4. Fetch All Items (paginated)
        let allItems = [];
        let page = 1;
        const limit = 200;
        let total = 0;

        do {
            const itemsResp = await petpoojaClient({
                req,
                endpoint: `/api/v1/menu/items?page=${page}&limit=${limit}`,
                method: "GET",
            });

            const pageData = itemsResp?.data?.data || [];
            total = itemsResp?.data?.total || pageData.length;
            allItems.push(...pageData);

            if (pageData.length === 0 || allItems.length >= total) {
                break;
            }
            page += 1;
        } while (page <= 20);

        // 4b. Fetch Petpooja base sheet CSV to retrieve accurate item descriptions
        // (Since /api/v1/menu/items does not return the description field)
        const csvDescMap = new Map();
        try {
            const pickerRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/categories/picker",
                method: "GET",
            });
            const pickerCats = pickerRes?.data?.categories || [];
            if (pickerCats.length > 0) {
                const catIds = pickerCats.map((c) => c.id).join(",");
                const rawCsv = await petpoojaClient({
                    req,
                    endpoint: `/api/v1/menu/items/base-sheet/export?categoryIds=${encodeURIComponent(catIds)}`,
                    method: "GET",
                    responseType: "text",
                });
                if (rawCsv && typeof rawCsv === "string") {
                    const rows = parseCSV(rawCsv);
                    if (rows.length > 1) {
                        const header = rows[0];
                        const idIdx = header.findIndex((h) => h.trim().toLowerCase() === "item id");
                        const descIdx = header.findIndex((h) => h.trim().toLowerCase() === "description");
                        if (idIdx !== -1 && descIdx !== -1) {
                            for (let i = 1; i < rows.length; i++) {
                                const rId = rows[i][idIdx]?.trim();
                                const rDesc = rows[i][descIdx]?.trim();
                                if (rId && rDesc) {
                                    csvDescMap.set(rId, rDesc);
                                }
                            }
                        }
                    }
                }
            }
        } catch (csvErr) {
            console.warn("Could not fetch base sheet descriptions during Petpooja import:", csvErr?.message);
        }

        // Also load existing clean descriptions from MongoDB to avoid losing any clean AI-generated descriptions
        const existingDbDescMap = new Map();
        try {
            const existingDoc = await Menu.findOne({ resId: String(resId), platform: "petpooja" });
            if (existingDoc && Array.isArray(existingDoc.menu)) {
                for (const cat of existingDoc.menu) {
                    for (const sub of (cat.sub_category || [])) {
                        for (const it of (sub.items || [])) {
                            if (it.id && it.description && !isJunkDescription(it.description, it.name)) {
                                existingDbDescMap.set(String(it.id), it.description.trim());
                                if (it.name) existingDbDescMap.set(it.name.trim().toLowerCase(), it.description.trim());
                            }
                        }
                    }
                }
            }
        } catch (dbReadErr) {
            console.warn("Could not load existing descriptions from DB:", dbReadErr?.message);
        }

        // 5. Build parsed menu structure
        const categoryMap = new Map();

        // Initialize from category list
        for (const cat of categories) {
            const catName = cat.name?.trim() || "General";
            categoryMap.set(catName, {
                id: String(cat.id || `temp-${crypto.randomUUID()}`),
                name: catName,
                items: [],
                rank: cat.rank || 0,
            });
        }

        // Map items into their category
        for (const item of allItems) {
            const catName = item.category?.name?.trim() || "Other Items";
            if (!categoryMap.has(catName)) {
                categoryMap.set(catName, {
                    id: String(item.category?.id || `temp-${crypto.randomUUID()}`),
                    name: catName,
                    items: [],
                    rank: 9999,
                });
            }

            const isVeg = item.food_type?.toLowerCase() === "veg"
                ? "VEG"
                : item.food_type?.toLowerCase() === "egg"
                    ? "EGG"
                    : "NON_VEG";

            const basePrice = Number(item.price ?? item.price_min ?? 0);

            let imgUrl = item.images?.main || item.images?.platform?.zomato || item.images?.platform?.swiggy || item.image || item.image_url || "";
            let imgKey = "";
            if (typeof imgUrl === "string" && imgUrl.includes("temp-uploads-live.s3")) {
                const key = imgUrl.split("/").pop().replace(/^thumb_/, "");
                imgKey = key;
                try {
                    const localPath = path.join(process.cwd(), "public", "uploads", "petpooja", key);
                    if (fs.existsSync(localPath)) {
                        imgUrl = `/uploads/petpooja/${key}`;
                    }
                } catch (e) {}
            }

            // Determine accurate description
            const rawCsvDesc = csvDescMap.get(String(item.id)) || item.description || item.long_description || "";
            const isCsvDescReal = !isJunkDescription(rawCsvDesc, item.name);
            const savedDbDesc = existingDbDescMap.get(String(item.id)) || existingDbDescMap.get(item.name?.trim().toLowerCase());

            let finalDesc = "";
            if (savedDbDesc && !isJunkDescription(savedDbDesc, item.name)) {
                // Keep the verified clean description from MongoDB if CSV has junk or identical
                finalDesc = savedDbDesc;
            } else if (isCsvDescReal) {
                finalDesc = rawCsvDesc.trim();
            } else {
                // If CSV only had junk like "14", "13", "Wrap + 1 Fries...", keep it empty
                finalDesc = "";
            }

            categoryMap.get(catName).items.push({
                id: String(item.id),
                temp_id: "",
                name: item.name?.trim(),
                description: finalDesc,
                base_price: basePrice,
                price: basePrice,
                min_price: Number(item.price_min ?? basePrice),
                max_price: Number(item.price_max ?? basePrice),
                is_veg: isVeg,
                packing_charges: 0,
                media: imgUrl ? [{ url: imgUrl, thumbUrl: imgUrl, key: imgKey }] : [],
                variants: [],
                addons: [],
                status: item.status === 1,
                inStock: item.status === 1,
                raw: item,
            });
        }

        // Convert into the standard menu format expected by Menu manager
        const parsedMenu = Array.from(categoryMap.values())
            .filter((cat) => cat.items.length > 0)
            .sort((a, b) => (a.rank || 0) - (b.rank || 0))
            .map((cat) => ({
                id: cat.id,
                temp_id: "",
                name: cat.name,
                sub_category: [
                    {
                        id: `sub-${cat.id}`,
                        temp_id: "",
                        name: cat.name,
                        items: cat.items,
                    },
                ],
            }));

        // 6. Save or update menu in MongoDB
        const updatedMenuDoc = await Menu.findOneAndUpdate(
            { resId: String(resId), platform: "petpooja" },
            {
                resId: String(resId),
                platform: "petpooja",
                name: restaurantName,
                menu: parsedMenu,
                addons: [],
            },
            { upsert: true, new: true }
        );

        return NextResponse.json(
            {
                success: true,
                message: "Menu imported successfully from Petpooja",
                data: updatedMenuDoc,
                stats: {
                    categories: parsedMenu.length,
                    totalItems: allItems.length,
                },
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("Petpooja Menu Import Error:", err);
        const status = err?.status || err?.response?.status || 500;
        return NextResponse.json(
            {
                success: false,
                message: err?.message || "Internal Server Error",
                status,
            },
            { status: typeof status === "number" && status >= 400 && status < 600 ? status : 500 }
        );
    }
}