const fs = require('fs');
const path = require('path');

function generateTempId() {
    return 'temp-' + Math.random().toString(36).substr(2, 9);
}

function cleanText(s) {
    if (!s) return "";
    s = s.trim();
    s = s.replace(/^[,\s.]+|[,\s.]+$/g, "");
    s = s.replace(/(?<=[a-zA-Z])\,(?=[a-zA-Z])/g, ", ");
    s = s.replace(/,\s*,+/g, ", ");
    s = s.replace(/\.\s*\.+/g, ".");
    s = s.replace(/,\s*\(/g, " (");
    s = s.replace(/^[,\s.]+|[,\s.]+$/g, "");
    return s.trim();
}

function cleanTitle(s) {
    if (!s) return "";
    s = cleanText(s);
    s = s.replace(/--+/g, " - ");
    s = s.replace(/\.,+/g, "");
    s = s.replace(/\s+/g, " ");

    const titleMap = {
        "indian, Biryani, Thali & Chinese (Veg, Non-Veg)": "Indian, Biryani, Thali & Chinese (Veg, Non-Veg)",
        "Veg, indian Curries": "Veg Indian Curries",
        "Veg,indian Curries": "Veg Indian Curries",
        "Veg chinese starters": "Veg Chinese Starters",
        "Chicken, Hydrabadi Dum Biryani": "Chicken Hyderabadi Dum Biryani",
        "Veg, Hydrabadi Dum Biryani": "Veg Hyderabadi Dum Biryani",
        "Anda Hydrabadi Dum Biryani": "Anda Hyderabadi Dum Biryani"
    };

    if (titleMap[s]) {
        return titleMap[s];
    }

    if (s.length > 0 && s[0] === s[0].toLowerCase()) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
    }
    return cleanText(s);
}

function detectVeg(itemName, subcatName, catName, desc) {
    const iname = (itemName || "").toLowerCase();
    if (["chicken", "mutton", "fish", "meat", "prawn", "crab"].some(w => iname.includes(w))) {
        return "NON_VEG";
    }
    if (["anda", "egg", "omelette"].some(w => iname.includes(w))) {
        return "EGG";
    }
    if (iname.includes("veg") && !["non-veg", "non veg", "chicken", "mutton", "fish"].some(w => iname.includes(w))) {
        return "VEG";
    }
    if (["paneer", "aloo", "dal", "gobi", "matar", "chapati", "bhakri", "jeera rice", "plain rice", "khichdi"].some(w => iname.includes(w))) {
        return "VEG";
    }

    const sname = (subcatName || "").toLowerCase();
    if (sname.includes("non-veg") || sname.includes("non veg") || sname.includes("chicken")) {
        return "NON_VEG";
    }
    if (sname.includes("veg")) {
        return "VEG";
    }

    const text = `${itemName} ${desc}`.toLowerCase();
    if (["chicken", "mutton", "fish", "meat", "prawn"].some(w => text.includes(w))) {
        return "NON_VEG";
    }
    if (["anda", "egg", "omelette"].some(w => text.includes(w))) {
        return "EGG";
    }
    return "VEG";
}

// Simple CSV parser supporting multiline quotes
function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentRow.push(currentField);
            currentField = '';
            if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
        } else {
            currentField += char;
        }
    }
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.some(f => f.trim() !== '')) {
            rows.push(currentRow);
        }
    }
    return rows;
}

function parseTheNewDragonCSV() {
    const csvPath = path.join(__dirname, 'the new dragon - Catalogues.csv');
    const rawCSV = fs.readFileSync(csvPath, 'utf8');
    const allRows = parseCSV(rawCSV);

    const headers = allRows[0].map(h => h.trim());
    const dataRows = allRows.slice(1);

    const records = dataRows.map(row => {
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = row[idx] || '';
        });
        return obj;
    });

    const restaurantId = "123456789";

    // Grouping: Category -> SubCategory -> Catalogue Items (catalogue_id) -> Variant Rows
    const categoriesMap = new Map();

    records.forEach(record => {
        const catName = cleanTitle(record.category_name);
        const subcatName = cleanTitle(record.subcategory_name);
        const catalogueId = (record.catalogue_id || '').trim();
        const catalogueName = cleanTitle(record.catalogue_name);

        if (!categoriesMap.has(catName)) {
            categoriesMap.set(catName, new Map());
        }
        const subcategoriesMap = categoriesMap.get(catName);

        if (!subcategoriesMap.has(subcatName)) {
            subcategoriesMap.set(subcatName, new Map());
        }
        const itemsMap = subcategoriesMap.get(subcatName);

        const itemKey = catalogueId || catalogueName;
        if (!itemsMap.has(itemKey)) {
            itemsMap.set(itemKey, {
                catalogueId: catalogueId,
                catalogueName: catalogueName,
                description: cleanText(record.description),
                imageUrl: (record.image_url || '').trim(),
                categoryName: catName,
                subcategoryName: subcatName,
                variants: []
            });
        }

        const itemObj = itemsMap.get(itemKey);
        // If image or description was empty earlier and present here, update it
        if (!itemObj.description && record.description) {
            itemObj.description = cleanText(record.description);
        }
        if (!itemObj.imageUrl && record.image_url) {
            itemObj.imageUrl = (record.image_url || '').trim();
        }

        itemObj.variants.push({
            variantId: (record.variant_id || '').trim(),
            variantName: cleanText(record.variant_name),
            price: Number(record.current_price) || 0
        });
    });

    const zomatoMenu = [];

    for (const [catName, subcategoriesMap] of categoriesMap.entries()) {
        const categoryId = generateTempId();
        const subCategoriesList = [];

        for (const [subcatName, itemsMap] of subcategoriesMap.entries()) {
            const subCategoryId = generateTempId();
            const itemsList = [];

            for (const itemData of itemsMap.values()) {
                const isVeg = detectVeg(itemData.catalogueName, itemData.subcategoryName, itemData.categoryName, itemData.description);
                let basePrice = itemData.variants.length > 0 ? itemData.variants[0].price : 0;
                
                // If there are multiple variants, base price should be the lowest variant price
                if (itemData.variants.length > 1) {
                    const minPrice = Math.min(...itemData.variants.map(v => v.price));
                    if (minPrice > 0) basePrice = minPrice;
                }

                const item = {
                    id: generateTempId(),
                    temp_id: "",
                    name: itemData.catalogueName,
                    description: itemData.description,
                    base_price: basePrice,
                    is_veg: isVeg,
                    packing_charges: 0,
                    variants: [],
                    addons: [],
                    media: itemData.imageUrl ? [{ url: itemData.imageUrl }] : []
                };

                // If item has more than 1 variant, add variant group
                if (itemData.variants.length > 1) {
                    const variantGroup = {
                        property_name: "Quantity",
                        property_id: generateTempId(),
                        options: itemData.variants.map((v, idx) => ({
                            option_name: v.variantName || `Option ${idx + 1}`,
                            option_id: generateTempId(),
                            variant_id: generateTempId(),
                            price: v.price,
                            is_default: idx === 0
                        }))
                    };
                    item.variants.push(variantGroup);
                }

                itemsList.push(item);
            }

            if (itemsList.length > 0) {
                subCategoriesList.push({
                    id: subCategoryId,
                    temp_id: "",
                    name: subcatName,
                    items: itemsList
                });
            }
        }

        if (subCategoriesList.length > 0) {
            zomatoMenu.push({
                id: categoryId,
                temp_id: "",
                name: catName,
                sub_category: subCategoriesList
            });
        }
    }

    const result = {
        resId: restaurantId,
        platform: "zomato",
        menu: zomatoMenu
    };

    const outputPath = path.join(__dirname, 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 4));
    console.log(`Successfully parsed menu into ${outputPath}`);
    console.log(`Categories count: ${zomatoMenu.length}`);
    let totalSubcats = 0;
    let totalItems = 0;
    zomatoMenu.forEach(c => {
        totalSubcats += c.sub_category.length;
        c.sub_category.forEach(s => {
            totalItems += s.items.length;
        });
    });
    console.log(`Subcategories count: ${totalSubcats}`);
    console.log(`Items count: ${totalItems}`);
}

parseTheNewDragonCSV();
