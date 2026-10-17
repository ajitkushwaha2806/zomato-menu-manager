#!/usr/bin/env node

/**
 * Headless CLI script to sync all connected Zomato restaurants and their menus into MongoDB.
 * 
 * Usage:
 *   node scripts/sync_all_zomato_menus.js
 *   node scripts/sync_all_zomato_menus.js --cookie="YOUR_ZOMATO_COOKIE"
 *   node scripts/sync_all_zomato_menus.js --concurrency=3 --skip-existing
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../frontend/.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI not found in frontend/.env!");
    process.exit(1);
}

// Parse CLI flags
const args = process.argv.slice(2);
let customCookie = null;
let concurrency = 3;
let skipExisting = false;

args.forEach(arg => {
    if (arg.startsWith('--cookie=')) {
        customCookie = arg.split('=').slice(1).join('=');
    } else if (arg.startsWith('--concurrency=')) {
        concurrency = parseInt(arg.split('=')[1], 10) || 3;
    } else if (arg === '--skip-existing') {
        skipExisting = true;
    }
});

const cookie = customCookie || process.env.ZOMATO_COOKIES;

const MenuSchema = new mongoose.Schema({
    resId: { type: String, required: true },
    platform: { type: String, required: true },
    name: { type: String },
    menu: { type: Array, default: [] },
    charges: { type: Array, default: [] },
    updatedAt: { type: Date, default: Date.now }
}, { strict: false, timestamps: true });

MenuSchema.index({ resId: 1, platform: 1 }, { unique: true });

const Menu = mongoose.models.Menu || mongoose.model('Menu', MenuSchema);

function extractZomatoImageUrl(dish) {
    if (!dish || typeof dish !== "object") return null;

    const directKeys = [
        "image_url", "imageUrl", "img_url", "image", "photo", "pic", "thumb",
        "dish_image_url", "dishImageUrl", "dish_image", "item_image_url",
        "item_image", "photo_url", "thumbnail_url", "display_image_url"
    ];

    for (const key of directKeys) {
        const val = dish[key];
        if (typeof val === "string" && val.trim().length > 0 && !val.includes("placeholder") && !val.includes("default_dish")) {
            let u = val.trim();
            if (u.startsWith("//")) u = "https:" + u;
            return u;
        }
        if (val && typeof val === "object" && typeof val.url === "string" && val.url.trim().length > 0) {
            let u = val.url.trim();
            if (u.startsWith("//")) u = "https:" + u;
            return u;
        }
    }

    if (Array.isArray(dish.media) && dish.media.length > 0) {
        for (const m of dish.media) {
            if (!m) continue;
            const u = m.url || m.thumbUrl || m.imageUrl;
            if (typeof u === "string" && u.trim().length > 0 && !u.includes("placeholder")) {
                let clean = u.trim();
                if (clean.startsWith("//")) clean = "https:" + clean;
                return clean;
            }
        }
    }

    return null;
}

async function getConnectedRestaurants() {
    console.log("🔍 Fetching connected Zomato restaurants...");
    const url = "https://www.zomato.com/partner_portal/partner_dashboard/get_res_details";
    const res = await axios.get(url, {
        headers: {
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.zomato.com/partner_portal/menu/editor"
        },
        timeout: 20000
    });

    const data = res.data;
    const entities = data.entities || data.restaurants || [];
    return entities.map(e => ({
        id: String(e.res_id || e.id || e.resId),
        name: e.name || e.res_name || `Restaurant ${e.res_id || e.id}`
    }));
}

async function fetchMenuFromZomato(resId) {
    const url = `https://www.zomato.com/partner_portal/menu/v1/res/menu?res_id=${resId}`;
    const res = await axios.get(url, {
        headers: {
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.zomato.com/partner_portal/menu/editor"
        },
        timeout: 30000
    });
    return res.data;
}

async function run() {
    console.log("==================================================");
    console.log("  🚀 ZOMATO RESTAURANT MENU SYNC TO MONGODB");
    console.log("==================================================");

    if (!cookie) {
        console.error("❌ No Zomato Cookie provided! Provide via --cookie=\"...\" or set ZOMATO_COOKIES in .env");
        process.exit(1);
    }

    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI);
    console.log("✓ Connected to MongoDB.");

    let restaurants = [];
    try {
        restaurants = await getConnectedRestaurants();
    } catch (err) {
        console.error("❌ Failed to fetch restaurants from Zomato:", err.response?.data || err.message);
        console.log("Tip: Ensure your cookie is valid and not expired.");
        process.exit(1);
    }

    console.log(`✓ Found ${restaurants.length} connected accounts.`);

    // Find existing menus if skipExisting is requested
    let existingIds = new Set();
    if (skipExisting) {
        const existing = await Menu.find({ platform: 'zomato' }, { resId: 1 }).lean();
        existing.forEach(m => existingIds.add(m.resId));
        console.log(`ℹ️ ${existingIds.size} restaurants already have menus in DB.`);
    }

    const queue = restaurants.filter(r => !skipExisting || !existingIds.has(r.id));
    console.log(`⏳ Ready to sync ${queue.length} restaurants (Concurrency: ${concurrency})...\n`);

    let completed = 0;
    let totalItemsSaved = 0;
    let totalImagesFound = 0;
    let failed = 0;

    let index = 0;
    async function worker() {
        while (index < queue.length) {
            const item = queue[index++];
            if (!item) break;

            try {
                const zomatoData = await fetchMenuFromZomato(item.id);
                const categories = zomatoData?.menu || zomatoData?.data?.menu || [];

                let resItemCount = 0;
                let resImgCount = 0;

                const mappedMenu = categories.map(cat => ({
                    id: String(cat.category_id || cat.id || `cat-${Math.random()}`),
                    name: cat.category_name || cat.name || "Untitled Category",
                    sub_category: (cat.sub_categories || cat.sub_category || []).map(sub => ({
                        id: String(sub.sub_category_id || sub.id || `sub-${Math.random()}`),
                        name: sub.sub_category_name || sub.name || "Untitled Subcategory",
                        items: (sub.items || []).map(dish => {
                            resItemCount++;
                            const rawImg = extractZomatoImageUrl(dish);
                            if (rawImg) resImgCount++;

                            return {
                                id: String(dish.item_id || dish.id || `item-${Math.random()}`),
                                name: dish.item_name || dish.name || "Untitled Dish",
                                price: dish.price ?? 0,
                                is_veg: dish.is_veg === 1 || dish.is_veg === "VEG" ? "VEG" : "NON_VEG",
                                media: rawImg ? [{ url: rawImg }] : []
                            };
                        })
                    }))
                }));

                await Menu.findOneAndUpdate(
                    { resId: item.id, platform: "zomato" },
                    {
                        resId: item.id,
                        platform: "zomato",
                        name: item.name,
                        menu: mappedMenu,
                        updatedAt: new Date()
                    },
                    { upsert: true, new: true }
                );

                completed++;
                totalItemsSaved += resItemCount;
                totalImagesFound += resImgCount;

                console.log(`[${completed}/${queue.length}] ✓ ${item.name} (${item.id}): ${resItemCount} items, ${resImgCount} images`);
            } catch (err) {
                failed++;
                console.error(`[${completed + failed}/${queue.length}] ✗ ${item.name} (${item.id}): ${err.message}`);
            }

            // Respectful 500ms delay between calls
            await new Promise(r => setTimeout(r, 500));
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    console.log("\n==================================================");
    console.log(`🎉 SYNC FINISHED!`);
    console.log(`Total Synced: ${completed}`);
    console.log(`Total Failed: ${failed}`);
    console.log(`Total Items Stored in DB: ${totalItemsSaved}`);
    console.log(`Total Authentic Images Cached: ${totalImagesFound}`);
    console.log("==================================================");

    process.exit(0);
}

run().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
