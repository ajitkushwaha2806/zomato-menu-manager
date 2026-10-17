const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, 'frontend/.env') });

const getNormalizedUrl = (url) => {
    let cleanedUrl = (url || '').trim();
    if (!/^https?:\/\//i.test(cleanedUrl)) {
        cleanedUrl = `https://${cleanedUrl}`;
    }

    const parsed = new URL(cleanedUrl);
    const domain = `${parsed.protocol}//${parsed.host}`;
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length < 2) {
        throw new Error('Invalid URL: city and outlet_name are required');
    }

    const city = parts[0];
    const outletName = parts[1];
    return `${domain}/${city}/${outletName}/order`;
};

const parseVariantGroups = (itemData) => {
    if (!itemData || !Array.isArray(itemData.groups)) {
        return [];
    }

    return itemData.groups
        .map((groupWrapper) => {
            const group = groupWrapper?.group;
            if (!group) return null;

            const rawItems = Array.isArray(group?.items) ? group.items : [];
            const propId = `temp-${crypto.randomUUID()}`;

            return {
                property_name: group?.name || group?.label || 'Variant',
                property_id: propId,
                options: rawItems
                    .map((itemWrapper, idx) => {
                        const option = itemWrapper?.item || {};
                        const optPrice = Number(
                            option?.price ||
                            option?.default_price ||
                            option?.display_price ||
                            option?.min_price ||
                            0
                        );

                        return {
                            option_name: option?.name || '',
                            option_id: `temp-${crypto.randomUUID()}`,
                            variant_id: `temp-${crypto.randomUUID()}`,
                            price: optPrice,
                            is_default: !!option?.is_default || idx === 0,
                        };
                    })
                    .sort((a, b) => a.price - b.price),
            };
        })
        .filter(Boolean);
};

const extractZomatoImageUrl = (itemData) => {
    if (!itemData) return null;

    let url = null;
    if (typeof itemData.item_image_url === 'string' && itemData.item_image_url.trim()) {
        url = itemData.item_image_url.trim();
    } else if (typeof itemData.image_url === 'string' && itemData.image_url.trim()) {
        url = itemData.image_url.trim();
    } else if (typeof itemData.imageUrl === 'string' && itemData.imageUrl.trim()) {
        url = itemData.imageUrl.trim();
    } else if (typeof itemData.thumb_url === 'string' && itemData.thumb_url.trim()) {
        url = itemData.thumb_url.trim();
    } else if (typeof itemData.thumbUrl === 'string' && itemData.thumbUrl.trim()) {
        url = itemData.thumbUrl.trim();
    } else if (Array.isArray(itemData.media) && itemData.media.length > 0) {
        const first = itemData.media[0];
        if (typeof first === 'string' && first.trim()) url = first.trim();
        else if (first?.image?.url) url = first.image.url;
        else if (typeof first?.url === 'string') url = first.url;
        else if (typeof first?.thumbUrl === 'string') url = first.thumbUrl;
    } else if (typeof itemData.media?.url === 'string' && itemData.media.url.trim()) {
        url = itemData.media.url.trim();
    } else if (typeof itemData.image?.url === 'string' && itemData.image.url.trim()) {
        url = itemData.image.url.trim();
    } else if (typeof itemData.image === 'string' && itemData.image.trim()) {
        url = itemData.image.trim();
    } else if (typeof itemData.item_image?.url === 'string' && itemData.item_image.url.trim()) {
        url = itemData.item_image.url.trim();
    } else if (typeof itemData.item_image === 'string' && itemData.item_image.trim()) {
        url = itemData.item_image.trim();
    }

    if (url && url.startsWith('//')) {
        url = 'https:' + url;
    }
    return url ? url.trim() : null;
};

async function importZomatoMenu(rawUrl) {
    const pageUrl = getNormalizedUrl(rawUrl);
    console.log(`[IMPORT] Normalized Zomato URL: ${pageUrl}`);

    const zomatoCookie = process.env.ZOMATO_COOKIES || '';

    const response = await axios.get('https://www.zomato.com/webroutes/getPage', {
        params: {
            page_url: pageUrl,
            location: '',
            isMobile: 0,
        },
        headers: {
            accept: '*/*',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'user-agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
            ...(zomatoCookie ? { cookie: zomatoCookie } : {}),
        },
        timeout: 30000,
    });

    const pageData = response?.data?.page_data || {};
    const menus = pageData?.order?.menuList?.menus || [];
    const rawModifierGroups = pageData?.order?.menuList?.modifierGroups || {};
    const restaurantName = pageData?.sections?.SECTION_BASIC_INFO?.name || 'Bongo Bites';
    const resId = String(pageData?.sections?.SECTION_BASIC_INFO?.res_id || '22820899');

    // 1. Parse Addons (Modifier Groups)
    const modifierGroupEntries = Array.isArray(rawModifierGroups)
        ? rawModifierGroups
        : Object.values(rawModifierGroups || {});

    const parsedAddons = [];
    const groupIdToAddonId = new Map();

    for (const groupWrapper of modifierGroupEntries) {
        const group = groupWrapper?.group;
        if (!group?.name) continue;

        const addonId = `temp-${crypto.randomUUID()}`;
        const rawGroupItems = Array.isArray(group.items) ? group.items : [];
        const resolvedOptions = [];

        for (const itemWrapper of rawGroupItems) {
            const zItem = itemWrapper?.item;
            if (!zItem?.name) continue;

            const price = Number(
                zItem.price ||
                zItem.default_price ||
                zItem.display_price ||
                zItem.min_price ||
                0
            );

            let optDietary = 'NON_VEG';
            const optSlugs = [
                ...(Array.isArray(zItem.dietary_slugs) ? zItem.dietary_slugs : []),
                ...(Array.isArray(zItem.tag_slugs) ? zItem.tag_slugs : []),
            ].map((s) => String(s).toLowerCase());

            if (optSlugs.some((s) => s.includes('egg'))) {
                optDietary = 'EGG';
            } else if (optSlugs.some((s) => s.includes('veg') && !s.includes('non-veg'))) {
                optDietary = 'VEG';
            }

            resolvedOptions.push({
                id: `temp-${crypto.randomUUID()}`,
                catalogue_id: '',
                name: zItem.name?.trim() || '',
                description: zItem.desc || '',
                price: price,
                is_veg: optDietary,
                is_default: !!zItem.is_default || false,
                map_id: `temp-${crypto.randomUUID()}`,
            });
        }

        const minVal = group.min ?? 0;
        const maxVal = group.max ?? 1;

        parsedAddons.push({
            id: addonId,
            name: group.name?.trim() || '',
            min: minVal,
            max: maxVal,
            is_compulsory: minVal > 0,
            allow_multiple: maxVal > 1,
            max_per_item: group.maxSelectionsPerItem || maxVal || 1,
            options: resolvedOptions,
        });

        const rawGid = group.id || group.group_id || group.modifier_group_id;
        if (rawGid) {
            groupIdToAddonId.set(String(rawGid), addonId);
        }
    }

    // 2. Parse Menu Categories & Items
    const parsedMenu = [];
    let totalItems = 0;
    let totalImages = 0;
    let totalVariants = 0;
    let totalLinkedAddons = 0;

    for (const menuWrapper of menus) {
        const menu = menuWrapper?.menu || {};
        const categoryName = menu.name?.trim();
        if (!categoryName) continue;

        const subCategories = Array.isArray(menu.categories) ? menu.categories : [];
        const parsedSubCategories = [];

        for (const subWrapper of subCategories) {
            const subCategoryData = subWrapper?.category || {};
            const subCategoryName = subCategoryData.name?.trim() || categoryName;

            const rawItems = Array.isArray(subCategoryData.items) ? subCategoryData.items : [];
            const parsedItems = [];

            for (const itemWrapper of rawItems) {
                const itemData = itemWrapper?.item || {};
                if (!itemData.name?.trim()) continue;

                const variants = parseVariantGroups(itemData);

                let basePrice = Number(
                    itemData.price ||
                    itemData.default_price ||
                    itemData.display_price ||
                    itemData.min_price ||
                    0
                );

                if (variants.length > 0) {
                    let lowestPrice = Infinity;
                    variants.forEach((v) => {
                        v.options?.forEach((opt) => {
                            if (opt.price > 0 && opt.price < lowestPrice) {
                                lowestPrice = opt.price;
                            }
                        });
                    });
                    if (lowestPrice !== Infinity && (!basePrice || lowestPrice < basePrice)) {
                        basePrice = lowestPrice;
                    }
                }

                let dietaryType = 'NON_VEG';
                const slugs = [
                    ...(Array.isArray(itemData.dietary_slugs) ? itemData.dietary_slugs : []),
                    ...(Array.isArray(itemData.tag_slugs) ? itemData.tag_slugs : []),
                ].map((s) => String(s).toLowerCase());

                if (slugs.some((s) => s.includes('egg'))) {
                    dietaryType = 'EGG';
                } else if (slugs.some((s) => s.includes('veg') && !s.includes('non-veg'))) {
                    dietaryType = 'VEG';
                } else {
                    dietaryType = 'NON_VEG';
                }

                // Match addons
                const linkedAddons = [];
                const itemGroupIds = [
                    ...(Array.isArray(itemData.modifier_group_ids) ? itemData.modifier_group_ids : []),
                    ...(Array.isArray(itemData.modifier_groups) ? itemData.modifier_groups : []),
                    ...(Array.isArray(itemData.group_ids) ? itemData.group_ids : []),
                ];
                itemGroupIds.forEach((gid) => {
                    const idStr = typeof gid === 'object' ? String(gid?.id || gid?.group_id) : String(gid);
                    const matchedAddonId = groupIdToAddonId.get(idStr);
                    if (matchedAddonId && !linkedAddons.includes(matchedAddonId)) {
                        linkedAddons.push(matchedAddonId);
                    }
                });

                const itemId = `temp-${crypto.randomUUID()}`;
                const rawImageUrl = extractZomatoImageUrl(itemData);

                const itemObj = {
                    id: itemId,
                    temp_id: '',
                    name: itemData.name.trim(),
                    description: itemData.desc?.trim() || '',
                    base_price: basePrice,
                    price: basePrice,
                    min_price: Number(itemData.min_price || basePrice),
                    max_price: Number(itemData.max_price || basePrice),
                    is_veg: dietaryType,
                    packing_charges: 0,
                    media: rawImageUrl ? [{ url: rawImageUrl }] : [],
                    variants: variants,
                    ...(dietaryType === 'NON_VEG' ? { meatTypes: ['chicken'] } : {}),
                    onHold: false,
                    holdComments: [],
                    addons: linkedAddons,
                };

                parsedItems.push(itemObj);
                totalItems++;
                if (rawImageUrl) totalImages++;
                if (variants.length > 0) totalVariants++;
                if (linkedAddons.length > 0) totalLinkedAddons++;
            }

            parsedSubCategories.push({
                id: `temp-${crypto.randomUUID()}`,
                temp_id: '',
                name: subCategoryName,
                items: parsedItems,
            });
        }

        parsedMenu.push({
            id: `temp-${crypto.randomUUID()}`,
            temp_id: '',
            name: categoryName,
            sub_category: parsedSubCategories,
        });
    }

    const outputData = {
        resId,
        name: restaurantName,
        platform: 'zomato',
        menu: parsedMenu,
        addons: parsedAddons,
    };

    const outputPath = path.join(__dirname, 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 4), 'utf8');

    console.log(`\n==========================================`);
    console.log(`Menu successfully imported and saved to: ${outputPath}`);
    console.log(`==========================================`);
    console.log(`Restaurant Name:       ${restaurantName}`);
    console.log(`Restaurant ID:         ${resId}`);
    console.log(`Categories:            ${parsedMenu.length}`);
    console.log(`Total Items:           ${totalItems}`);
    console.log(`Items with Images:     ${totalImages} (direct Zomato URLs kept, no S3 upload)`);
    console.log(`Items with Variants:   ${totalVariants}`);
    console.log(`Items with Addons:     ${totalLinkedAddons}`);
    console.log(`Modifier/Addon Groups: ${parsedAddons.length}`);
    console.log(`File Size:             ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    console.log(`==========================================\n`);
}

const targetUrl = process.argv[2] || 'https://www.zomato.com/kolkata/bongo-bites-1-chinar-park';
importZomatoMenu(targetUrl).catch((err) => {
    console.error('Import failed:', err.message);
    process.exit(1);
});
