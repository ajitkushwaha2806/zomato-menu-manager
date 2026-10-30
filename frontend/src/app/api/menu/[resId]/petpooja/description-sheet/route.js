import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { generateMenuDescriptions } from "@/services/ai/generate-description";

/**
 * RFC 4180 compliant CSV parser
 */
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

/**
 * RFC 4180 compliant CSV serializer
 */
function stringifyCSV(rows) {
    return rows
        .map((row) =>
            row
                .map((cell) => {
                    const str = cell == null ? "" : String(cell);
                    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                })
                .join(",")
        )
        .join("\r\n");
}

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

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json({ success: false, message: "resId is required" }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const clientItems = Array.isArray(body?.items) ? body.items : [];

        // 1. Fetch categories from Petpooja picker API
        const pickerRes = await petpoojaClient({
            endpoint: "/api/v1/menu/categories/picker",
            method: "GET",
            headers: {
                Accept: "*/*",
            },
        });

        const categories = pickerRes?.data?.categories || [];
        if (!categories.length) {
            return NextResponse.json(
                { success: false, message: "No categories returned from Petpooja picker API" },
                { status: 400 }
            );
        }

        const categoryIds = categories.map((c) => c.id).join(",");

        // 2. Export base sheet CSV for all categories from Petpooja
        const rawCsv = await petpoojaClient({
            endpoint: `/api/v1/menu/items/base-sheet/export?categoryIds=${encodeURIComponent(categoryIds)}`,
            method: "GET",
            responseType: "text",
            headers: {
                Accept: "*/*",
            },
        });

        if (!rawCsv || typeof rawCsv !== "string") {
            return NextResponse.json(
                { success: false, message: "Failed to download base sheet from Petpooja" },
                { status: 502 }
            );
        }

        // 3. Collect descriptions (from DB + client state)
        const descMap = new Map();

        try {
            await dbConnect();
            const petpoojaMenu = await Menu.findOne({ resId, platform: "petpooja" });
            if (petpoojaMenu) {
                const cats = petpoojaMenu.menu?.categories || (Array.isArray(petpoojaMenu.menu) ? petpoojaMenu.menu : []);
                cats.forEach((cat) => {
                    const subCats = cat.sub_category || cat.sub_categories || [];
                    subCats.forEach((sc) => {
                        (sc.items || []).forEach((it) => {
                            if (it.description && it.description.trim()) {
                                const desc = it.description.trim();
                                if (!isJunkDescription(desc, it.name)) {
                                    if (it.id) descMap.set(String(it.id), desc);
                                    if (it.name) descMap.set(it.name.trim().toLowerCase(), desc);
                                }
                            }
                        });
                    });
                });
            }
        } catch (dbErr) {
            console.warn("Could not load descriptions from database:", dbErr?.message);
        }

        // Overlay descriptions passed by client (in-memory user edits) only if not junk
        clientItems.forEach((item) => {
            if (item?.description && item.description.trim()) {
                const desc = item.description.trim();
                if (!isJunkDescription(desc, item.name)) {
                    if (item.id) descMap.set(String(item.id), desc);
                    if (item.name) descMap.set(item.name.trim().toLowerCase(), desc);
                }
            }
        });

        // 4. Parse CSV and update Description column
        const rows = parseCSV(rawCsv);
        if (!rows || rows.length < 2) {
            return NextResponse.json(
                { success: false, message: "Downloaded Petpooja base sheet is empty" },
                { status: 400 }
            );
        }

        const headerRow = rows[0];
        const idIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "item id");
        const descIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "description");
        const nameIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "item name");
        const onlineNameIdx = headerRow.findIndex((h) => h.trim().toLowerCase() === "online display name");

        if (descIdx === -1) {
            return NextResponse.json(
                { success: false, message: "Description column not found in Petpooja sheet" },
                { status: 400 }
            );
        }

        // If any items in the sheet are missing descriptions or have junk/formulaic descriptions, auto-generate them
        const missingItems = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowId = idIdx !== -1 ? row[idIdx]?.trim() : "";
            const rowName = nameIdx !== -1 ? row[nameIdx]?.trim() : "";
            const rowNameLower = rowName.toLowerCase();
            const rowOnlineName = onlineNameIdx !== -1 ? row[onlineNameIdx]?.trim().toLowerCase() : "";
            const existingRowDesc = descIdx !== -1 ? row[descIdx]?.trim() || "" : "";

            const hasValidDesc = (rowId && descMap.has(rowId)) || (rowNameLower && descMap.has(rowNameLower)) || (rowOnlineName && descMap.has(rowOnlineName));
            const isRowDescJunk = isJunkDescription(existingRowDesc, rowName);

            if ((!hasValidDesc || isRowDescJunk) && rowId && rowName && !rowNameLower.includes("open item")) {
                missingItems.push({ item_id: rowId, name: rowName });
            }
        }

        if (missingItems.length > 0) {
            try {
                // Chunk into batches of 40
                for (let i = 0; i < missingItems.length; i += 40) {
                    const batch = missingItems.slice(i, i + 40);
                    const generated = await generateMenuDescriptions(batch);
                    (generated || []).forEach((g) => {
                        if (g?.description && !isJunkDescription(g.description, g.name)) {
                            const d = g.description.trim();
                            if (g.item_id) descMap.set(String(g.item_id), d);
                            if (g.name) descMap.set(g.name.trim().toLowerCase(), d);
                        }
                    });
                }
            } catch (genErr) {
                console.warn("Could not auto-generate missing descriptions:", genErr?.message);
            }
        }

        const goodsServicesIdx = headerRow.findIndex((h) => h.trim().toLowerCase().includes("goods/services"));

        let updatedCount = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowId = idIdx !== -1 ? row[idIdx]?.trim() : "";
            const rowName = nameIdx !== -1 ? row[nameIdx]?.trim().toLowerCase() : "";
            const rowOnlineName = onlineNameIdx !== -1 ? row[onlineNameIdx]?.trim().toLowerCase() : "";
            const existingRowDesc = descIdx !== -1 ? row[descIdx]?.trim() || "" : "";

            let desc = null;
            if (rowId && descMap.has(rowId)) {
                desc = descMap.get(rowId);
            } else if (rowName && descMap.has(rowName)) {
                desc = descMap.get(rowName);
            } else if (rowOnlineName && descMap.has(rowOnlineName)) {
                desc = descMap.get(rowOnlineName);
            }

            const isDescReal = !isJunkDescription(desc, rowName);
            const isExistingReal = !isJunkDescription(existingRowDesc, rowName);

            if (isDescReal) {
                row[descIdx] = desc.trim();
                updatedCount++;
            } else if (isExistingReal) {
                row[descIdx] = existingRowDesc;
            } else {
                // If neither is real food description, don't leave formulaic combo junk
                row[descIdx] = "";
            }

            // Ensure Goods/Services is populated so Petpooja validation succeeds
            if (goodsServicesIdx !== -1 && (!row[goodsServicesIdx] || row[goodsServicesIdx].trim() === "")) {
                row[goodsServicesIdx] = "services";
            }
        }

        const updatedCsv = stringifyCSV(rows);

        // 5. Directly import the updated CSV into Petpooja via base-sheet/import API
        const formData = new FormData();
        const csvBlob = new Blob([updatedCsv], { type: "text/csv" });
        formData.append("file", csvBlob, `Petpooja_Base_Menu_${resId}.csv`);

        const importRes = await petpoojaClient({
            endpoint: "/api/v1/menu/items/base-sheet/import",
            method: "POST",
            data: formData,
        });

        // 6. Save updated descriptions to MongoDB
        try {
            await dbConnect();
            const petpoojaMenu = await Menu.findOne({ resId, platform: "petpooja" });
            if (petpoojaMenu) {
                const cats = petpoojaMenu.menu?.categories || (Array.isArray(petpoojaMenu.menu) ? petpoojaMenu.menu : []);
                cats.forEach((cat) => {
                    const subCats = cat.sub_category || cat.sub_categories || [];
                    subCats.forEach((sc) => {
                        (sc.items || []).forEach((item) => {
                            const d = descMap.get(String(item.id)) || descMap.get(item.name?.trim().toLowerCase());
                            if (d && !isJunkDescription(d, item.name)) {
                                item.description = d;
                            }
                        });
                    });
                });
                petpoojaMenu.markModified("menu");
                await petpoojaMenu.save();
            }
        } catch (saveErr) {
            console.warn("Could not save updated menu to MongoDB:", saveErr?.message);
        }

        return NextResponse.json({
            success: true,
            message: importRes?.message || "Menu imported successfully to Petpooja",
            totalRows: rows.length - 1,
            updatedCount,
            petpoojaUpdated: importRes?.data?.updated,
            descriptions: Object.fromEntries(descMap),
        });
    } catch (error) {
        console.error("Petpooja description sheet export error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.response?.data?.message || error.message || "Failed to generate Petpooja description sheet",
            },
            { status: 500 }
        );
    }
}
