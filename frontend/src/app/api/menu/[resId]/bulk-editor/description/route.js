import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";
import { generateMenuDescriptions } from "@/services/ai/generate-description";
import { petpoojaClient } from "@/lib/api/petpooja-client";

const BATCH_SIZE = 40;
const CONCURRENCY = 1;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunk(array, size) {
    const chunks = [];

    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }

    return chunks;
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
    if (/^~\d+$/.test(d)) return true; // e.g. "~1", "~2"
    if (d.toLowerCase() === itemName?.trim().toLowerCase()) return true; // e.g. "Cheese Burger"
    if (d.length <= 3) return true;

    // Detect formulaic combo tags accidentally placed on parent items in Petpooja:
    // e.g. "Wrap + 1 Fries + 1 Cold Drink (S)"
    // e.g. "Burger + 1 Fries + 1 Cold Drink (S)"
    // e.g. "French Fries + 1 Cold Drink (M)"
    // e.g. "[Regular]"
    // e.g. "[Regular] [Chicken Preparation]"
    if (/^(wrap|burger)\s*\+\s*\d*\s*fries/i.test(d)) return true;
    if (/^french fries\s*\+\s*1\s*cold drink/i.test(d)) return true;
    if (/^\[regular\]/i.test(d)) return true;
    if (/^\+\s*\d+/i.test(d)) return true;

    return false;
}

export async function POST(req, { params }) {
    try {
        await dbConnect();
        const { resId } = await params;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "resId is required",
                },
                {
                    status: 400,
                },
            );
        }

        const body = await req.json().catch(() => ({}));
        const platform = body.platform || "zomato";
        
        const menu = await Menu.findOne({ resId, platform });

        if (!menu) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu not found",
                },
                {
                    status: 404,
                },
            );
        }

        // ==========================================
        // SPECIAL HANDLING FOR PETPOOJA PLATFORM
        // ==========================================
        if (platform === "petpooja") {
            // 1. Fetch categories from Petpooja picker API
            const pickerRes = await petpoojaClient({
                endpoint: "/api/v1/menu/categories/picker",
                method: "GET",
                headers: { Accept: "*/*" },
            });

            const pickerCategories = pickerRes?.data?.categories || [];
            if (!pickerCategories.length) {
                return NextResponse.json(
                    { success: false, message: "No categories returned from Petpooja picker API" },
                    { status: 400 }
                );
            }

            const categoryIds = pickerCategories.map((c) => c.id).join(",");

            // 2. Export base sheet CSV for all categories from Petpooja
            const rawCsv = await petpoojaClient({
                endpoint: `/api/v1/menu/items/base-sheet/export?categoryIds=${encodeURIComponent(categoryIds)}`,
                method: "GET",
                responseType: "text",
                headers: { Accept: "*/*" },
            });

            if (!rawCsv || typeof rawCsv !== "string") {
                return NextResponse.json(
                    { success: false, message: "Failed to download base sheet from Petpooja" },
                    { status: 502 }
                );
            }

            // 3. Parse CSV
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

            // 4. Map existing descriptions from CSV (only if not junk/number)
            const descriptionMap = new Map();
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowId = idIdx !== -1 ? row[idIdx]?.trim() : "";
                const rowName = nameIdx !== -1 ? row[nameIdx]?.trim() : "";
                const rowDesc = descIdx !== -1 ? row[descIdx]?.trim() : "";

                if (rowDesc && !isJunkDescription(rowDesc, rowName)) {
                    if (rowId) descriptionMap.set(rowId, rowDesc);
                    if (rowName) descriptionMap.set(rowName.trim().toLowerCase(), rowDesc);
                }
            }

            // Also check MongoDB menu items for existing valid descriptions
            const categories = Array.isArray(menu?.menu) ? menu.menu : (menu?.menu?.categories || []);
            categories.forEach((cat) => {
                const subCats = cat.sub_category || cat.sub_categories || [];
                subCats.forEach((sc) => {
                    (sc.items || []).forEach((it) => {
                        if (it.description && !isJunkDescription(it.description, it.name)) {
                            const desc = it.description.trim();
                            if (it.id && !descriptionMap.has(String(it.id))) descriptionMap.set(String(it.id), desc);
                            if (it.name && !descriptionMap.has(it.name.trim().toLowerCase())) descriptionMap.set(it.name.trim().toLowerCase(), desc);
                        }
                    });
                });
            });

            // 5. Identify items needing AI generation
            const itemsToProcess = [];
            const seenIds = new Set();
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowId = idIdx !== -1 ? row[idIdx]?.trim() : "";
                const rowName = nameIdx !== -1 ? row[nameIdx]?.trim() : "";
                const rowNameLower = rowName.toLowerCase();

                if (rowId && !seenIds.has(rowId) && !rowNameLower.includes("open item")) {
                    seenIds.add(rowId);
                    const hasDesc = descriptionMap.has(rowId) || descriptionMap.has(rowNameLower);
                    if (!hasDesc) {
                        itemsToProcess.push({
                            item_id: String(rowId),
                            name: rowName,
                        });
                    }
                }
            }

            // 6. Generate descriptions using AI for items missing description
            if (itemsToProcess.length > 0) {
                const batches = chunk(itemsToProcess, BATCH_SIZE);
                for (let i = 0; i < batches.length; i += CONCURRENCY) {
                    const currentBatches = batches.slice(i, i + CONCURRENCY);
                    const responses = await Promise.all(
                        currentBatches.map((batch) => generateMenuDescriptions(batch))
                    );
                    responses.flat().forEach((res) => {
                        if (res?.item_id && res?.description) {
                            descriptionMap.set(String(res.item_id), res.description);
                            if (res.name) descriptionMap.set(res.name.trim().toLowerCase(), res.description);
                        }
                    });

                    if (i + CONCURRENCY < batches.length) {
                        await delay(2000);
                    }
                }
            }

            // 7. Update MongoDB menu structure with new clean descriptions
            let updatedCount = 0;
            categories.forEach((cat) => {
                const subCats = cat.sub_category || cat.sub_categories || [];
                subCats.forEach((sc) => {
                    (sc.items || []).forEach((item) => {
                        const desc = descriptionMap.get(String(item.id)) || descriptionMap.get(item.name?.trim().toLowerCase());
                        if (desc) {
                            item.description = desc;
                            if (item.temp_id && String(item.temp_id).startsWith("temp-")) {
                                // keep temp
                            } else {
                                item.temp_id = `update-${String(item.id).replace(/^update-/, "")}`;
                            }
                            updatedCount++;
                        }
                    });
                });
            });

            menu.markModified("menu");
            await menu.save();

            // 8. Update CSV rows with descriptions
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const rowId = idIdx !== -1 ? row[idIdx]?.trim() : "";
                const rowName = nameIdx !== -1 ? row[nameIdx]?.trim().toLowerCase() : "";
                const rowOnlineName = onlineNameIdx !== -1 ? row[onlineNameIdx]?.trim().toLowerCase() : "";

                let desc = null;
                if (rowId && descriptionMap.has(rowId)) {
                    desc = descriptionMap.get(rowId);
                } else if (rowName && descriptionMap.has(rowName)) {
                    desc = descriptionMap.get(rowName);
                } else if (rowOnlineName && descriptionMap.has(rowOnlineName)) {
                    desc = descriptionMap.get(rowOnlineName);
                }

                if (desc && descIdx !== -1) {
                    row[descIdx] = desc;
                }
            }

            const updatedCsv = stringifyCSV(rows);
            const today = new Date().toISOString().split("T")[0];
            const fileName = `Petpooja_Base_Menu_${resId}_${today}.csv`;

            return NextResponse.json({
                success: true,
                platform: "petpooja",
                total_items: rows.length - 1,
                total_generated: itemsToProcess.length,
                updated_items: updatedCount,
                descriptions: Object.fromEntries(descriptionMap),
                csv: updatedCsv,
                fileName,
            });
        }

        // ==========================================
        // DEFAULT HANDLING (ZOMATO / SWIGGY)
        // ==========================================
        const itemsToProcess = [];
        const categories = Array.isArray(menu?.menu)
            ? menu.menu
            : menu?.menu?.categories || [];

        categories.forEach((category) => {
            const subCats = category.sub_category || category.sub_categories || [];
            subCats.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    if (
                        item?.id != null &&
                        typeof item?.name === "string" &&
                        item.name.trim() &&
                        isJunkDescription(item.description, item.name)
                    ) {
                        itemsToProcess.push({
                            item_id: String(item.id),
                            name: item.name.trim(),
                        });
                    }
                });
            });
        });

        if (itemsToProcess.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No items found to process",
                },
                {
                    status: 400,
                },
            );
        }

        const batches = chunk(itemsToProcess, BATCH_SIZE);

        const results = [];

        for (let i = 0; i < batches.length; i += CONCURRENCY) {
            const currentBatches = batches.slice(i, i + CONCURRENCY);

            const responses = await Promise.all(
                currentBatches.map((batch) => generateMenuDescriptions(batch)),
            );

            results.push(...responses.flat());

            if (i + CONCURRENCY < batches.length) {
                await delay(2000); // 2 second delay between batches to prevent 429 Too Many Requests
            }
        }

        const descriptionMap = new Map(
            results
                .filter((item) => item?.item_id && item?.description)
                .map((item) => [String(item.item_id), item.description]),
        );

        let updatedCount = 0;

        categories.forEach((category) => {
            const subCats = category.sub_category || category.sub_categories || [];
            subCats.forEach((subCategory) => {
                subCategory.items?.forEach((item) => {
                    const description = descriptionMap.get(String(item.id));

                    if (description) {
                        item.description = description;
                        if (item.temp_id && String(item.temp_id).startsWith('temp-')) {
                            // leave as is
                        } else {
                            item.temp_id = `update-${String(item.id).replace(/^update-/, '')}`;
                        }
                        updatedCount++;
                    }
                });
            });
        });

        menu.markModified("menu");
        await menu.save();

        return NextResponse.json({
            success: true,
            total_items: itemsToProcess.length,
            total_generated: results.length,
            updated_items: updatedCount,
            total_batches: batches.length,
            descriptions: Object.fromEntries(descriptionMap),
        });
    } catch (error) {
        console.error("Description generation route error:", error);

        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Something went wrong",
            },
            {
                status: 500,
            },
        );
    }
}

