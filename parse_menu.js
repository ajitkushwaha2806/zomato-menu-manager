const fs = require('fs');

function generateTempId() {
    return 'temp-' + Math.random().toString(36).substr(2, 9);
}

function parseSwiggyData() {
    const rawData = fs.readFileSync('/Users/ajitkushwaha3101/Desktop/zomato-menu-manager/scratch.json', 'utf8');
    const swiggyCategories = JSON.parse(rawData);

    const restaurantId = "123456789";
    const zomatoMenu = [];

    swiggyCategories.forEach(categoryObj => {
        const catCard = categoryObj.card?.card;
        if (!catCard || !catCard.title || !catCard.itemCards) return;

        const catName = catCard.title;

        const subCategory = {
            id: generateTempId(),
            temp_id: "",
            name: catName, // subcat same as cat name
            items: []
        };

        const category = {
            id: generateTempId(),
            temp_id: "",
            name: catName,
            sub_category: [subCategory]
        };

        catCard.itemCards.forEach(itemCard => {
            const itemInfo = itemCard.card?.info;
            if (!itemInfo) return;

            const basePrice = itemInfo.price ? itemInfo.price / 100 : (itemInfo.defaultPrice ? itemInfo.defaultPrice / 100 : 0);

            const item = {
                id: generateTempId(),
                temp_id: "",
                name: itemInfo.name || "",
                description: itemInfo.description || "",
                base_price: basePrice,
                is_veg: itemInfo.isVeg || itemInfo.itemAttribute?.vegClassifier === "VEG" ? "VEG" : "NONVEG",
                packing_charges: 0,
                variants: [],
                addons: [],
                media: [
                    {
                        url: "https://media-assets.swiggy.com/swiggy/image/upload/" + itemInfo.imageId
                    },
                ]
            };

            const swiggyVariantGroups = itemInfo.variantsV2?.variantGroups || itemInfo.variants?.variantGroups || [];
            if (swiggyVariantGroups.length > 0) {
                swiggyVariantGroups.forEach(group => {
                    const variant = {
                        property_name: group.name || "",
                        property_id: generateTempId(),
                        options: []
                    };

                    if (group.variations && group.variations.length > 0) {
                        group.variations.forEach(variation => {
                            variant.options.push({
                                option_name: variation.name || "",
                                option_id: generateTempId(),
                                variant_id: generateTempId(),
                                price: basePrice + (variation.price ? variation.price / 100 : 0),
                                is_default: variation.default === 1 ? true : false
                            });
                        });
                    }

                    item.variants.push(variant);
                });
            }

            subCategory.items.push(item);
        });

        if (subCategory.items.length > 0) {
            zomatoMenu.push(category);
        }
    });

    const result = {
        resId: restaurantId,
        platform: "zomato",
        menu: zomatoMenu
    };

    fs.writeFileSync('/Users/ajitkushwaha3101/Desktop/zomato-menu-manager/output.json', JSON.stringify(result, null, 4));
    console.log('Successfully generated output.json');
}

parseSwiggyData();
