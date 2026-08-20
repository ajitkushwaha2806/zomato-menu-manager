const fs = require('fs');

function generateTempId() {
    return 'temp-' + Math.random().toString(36).substr(2, 9);
}

function capitalizeSlug(slug) {
    if (!slug) return "Other";
    return slug
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function checkIsVeg(item) {
    if (item.category_slug && item.category_slug.toLowerCase() === 'non-veg-pizza') {
        return 'NONVEG';
    }
    const nonVegKeywords = ['chicken', 'fish', 'meat', 'egg', 'mutton', 'nugget', 'non-veg', 'non veg'];
    const textToCheck = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    for (const keyword of nonVegKeywords) {
        if (textToCheck.includes(keyword)) {
            return 'NONVEG';
        }
    }
    return 'VEG';
}

function parseMenuData() {
    const rawData = fs.readFileSync('/Users/ajitkushwaha3101/Desktop/zomato-menu-manager/scratch.json', 'utf8');
    const itemsList = JSON.parse(rawData);

    const restaurantId = "123456789";
    
    // Group items by category_slug
    const groups = {};
    itemsList.forEach(item => {
        const slug = item.category_slug || 'others';
        if (!groups[slug]) {
            groups[slug] = [];
        }
        groups[slug].push(item);
    });

    const zomatoMenu = [];

    for (const [slug, items] of Object.entries(groups)) {
        const catName = capitalizeSlug(slug);

        const subCategory = {
            id: generateTempId(),
            temp_id: "",
            name: catName,
            items: []
        };

        const category = {
            id: generateTempId(),
            temp_id: "",
            name: catName,
            sub_category: [subCategory]
        };

        items.forEach(rawItem => {
            const basePrice = rawItem.base_price || 0;

            const item = {
                id: generateTempId(),
                temp_id: "",
                name: rawItem.name || "",
                description: rawItem.description || "",
                base_price: basePrice,
                is_veg: checkIsVeg(rawItem),
                packing_charges: 0,
                variants: [],
                addons: [],
                media: rawItem.image_url ? [{ url: rawItem.image_url }] : []
            };

            if (rawItem.variants && rawItem.variants.length > 0) {
                const variant = {
                    property_name: "Size",
                    property_id: generateTempId(),
                    options: []
                };

                rawItem.variants.forEach((v, index) => {
                    variant.options.push({
                        option_name: v.label || "",
                        option_id: generateTempId(),
                        variant_id: generateTempId(),
                        price: Number(v.price) || 0,
                        is_default: index === 0
                    });
                });

                item.variants.push(variant);
            }

            subCategory.items.push(item);
        });

        if (subCategory.items.length > 0) {
            zomatoMenu.push(category);
        }
    }

    const result = {
        resId: restaurantId,
        platform: "zomato",
        menu: zomatoMenu
    };

    fs.writeFileSync('/Users/ajitkushwaha3101/Desktop/zomato-menu-manager/output.json', JSON.stringify(result, null, 4));
    console.log('Successfully generated output.json');
}

parseMenuData();

