import fs from "fs";
import axios from "axios";
import crypto from "crypto";
import dbConnect from "@/lib/db";
import MenuItem from "@/models/Item";
import Category from "@/models/Category";
import ImageAsset from "@/models/Image";
import { uploadToS3 } from "@/services/backend/s3";
import { JsonResponse } from "@/lib/api/responseHandler";
import { invalidateCategoryCache, invalidateItemCache } from "@/lib/api/helpers/cacheKeys";

const parseVariantGroups = (itemData) => {
    if (!itemData || !Array.isArray(itemData.groups)) {
        return [];
    }

    return itemData.groups
        .map((groupWrapper) => {
            const group = groupWrapper?.group;
            if (!group) return null;

            return {
                property_name: group?.name || group?.label || "",
                options: Array.isArray(group?.items)
                    ? group.items.map((itemWrapper) => {
                        const option = itemWrapper?.item || {};
                        return {
                            name: option?.name || "",
                            price: option?.price || option?.default_price || option?.display_price || option?.min_price || 0,
                        };
                    })
                    : [],
            };
        })
        .filter(Boolean);
};

const getNomalisedUrl = (url) => {
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const parsed = new URL(url);
  const domain = `${parsed.protocol}//${parsed.host}`;
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new Error("Invalid URL: city and outlet_name are required");
  }

  const city = parts[0];
  const outletName = parts[1];
  return `${domain}/${city}/${outletName}/order`;
}

export const GET = async (req, { params }) => {
    try {
        await dbConnect();
        const { searchParams } = new URL(req.url);
        const { id } = await params;

        if (!id) {
            return JsonResponse.error("Restaurant ID is required", 400);
        }

        const pageUrlParam = searchParams.get("pageUrl");
        if (!pageUrlParam) {
            return JsonResponse.error("pageUrl is required", 400);
        }

        let pageUrl = getNomalisedUrl(pageUrlParam)

        const response = await axios.get(
            "https://www.zomato.com/webroutes/getPage",
            {
                params: {
                    page_url: pageUrl,
                    location: "",
                    isMobile: 0,
                },
                headers: {
                    accept: "*/*",
                    "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
                    "user-agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                    cookie: process.env.ZOMATO_COOKIES
                },
            }
        );

        const menus = response?.data?.page_data?.order?.menuList?.menus || [];

        let categoriesImported = 0;
        let itemsImported = 0;

        for (const [menuIndex, menuWrapper] of menus.entries()) {
            const menu = menuWrapper?.menu || {};
            if (!menu.name) continue;

            const categoryPayload = {
                restaurant: id,
                name: menu.name,
                displayOrder: menuIndex,
                parentCategory: null
            };
            const mainCategory = await Category.create(categoryPayload);
            categoriesImported++;

            const subCategories = menu.categories || [];
            for (const [subIndex, subWrapper] of subCategories.entries()) {
                const subCategoryData = subWrapper?.category || {};
                const subCategoryName = subCategoryData.name?.trim() || menu.name;

                const subCategoryPayload = {
                    restaurant: id,
                    name: subCategoryName,
                    displayOrder: subIndex,
                    parentCategory: mainCategory._id
                };
                const subCategory = await Category.create(subCategoryPayload);
                categoriesImported++;

                const items = subCategoryData.items || [];
                for (const [itemIndex, itemWrapper] of items.entries()) {
                    const itemData = itemWrapper?.item || {};
                    if (!itemData.name) continue;

                    const variants = parseVariantGroups(itemData);
                    let dietaryType = "non-veg";
                    if (itemData.dietary_slugs?.includes("veg") || itemData.dietary_slugs?.includes("vegan")) {
                        dietaryType = "veg";
                    }

                    let image = null;
                    let zomatoImageUrl = null;
                    if (itemData.item_image_url) {
                        zomatoImageUrl = itemData.item_image_url;
                    } else if (itemData.media?.url) {
                        zomatoImageUrl = itemData.media.url;
                    }

                    if (zomatoImageUrl) {
                        try {
                            const imgResp = await axios.get(zomatoImageUrl, { responseType: 'arraybuffer' });
                            const buffer = Buffer.from(imgResp.data, "binary");
                            const extMatch = zomatoImageUrl.match(/\.(jpg|jpeg|png|webp|gif)/i);
                            const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
                            const s3Result = await uploadToS3({
                                file: buffer,
                                folder: `restaurant/${id}/menu/items`,
                                fileName: `item-${Date.now()}-${crypto.randomUUID()}${ext}`,
                            });
                            
                            const imageAsset = await ImageAsset.create({
                                restaurant: id,
                                original: {
                                    key: s3Result.key,
                                    mimeType: s3Result.contentType,
                                    sizeBytes: buffer.length
                                },
                                status: "PENDING"
                            });
                            image = imageAsset._id;
                        } catch (err) {
                            console.error("Failed to upload Zomato image to S3", err);
                            image = null; 
                        }
                    }

                    const basePrice = itemData.price || itemData.default_price || itemData.display_price || itemData.min_price || 0;

                    const itemPayload = {
                        restaurant: id,
                        category: mainCategory._id,
                        subCategory: subCategory._id,
                        name: itemData.name,
                        description: itemData.desc || "",
                        image: image,
                        media: image ? [image] : [], 
                        base_price: basePrice,
                        dietaryType: dietaryType,
                        variants: variants,
                        displayOrder: itemIndex,
                        isAvailable: true
                    };
                    await MenuItem.create(itemPayload);
                    itemsImported++;
                }
            }
        }

        await invalidateCategoryCache(id);
        await invalidateItemCache(id);

        return JsonResponse.success(
            null,
            "Menu imported successfully",
            200,
            {
                total_items: itemsImported,
                stats: {
                    categoriesImported,
                    itemsImported
                }
            }
        );
    } catch (error) {
        console.error("Zomato Menu Import Error:", error?.response?.data || error);
        return JsonResponse.error(
            error?.response?.data?.message || error?.message || "Failed to import menu",
            error?.response?.status || 500
        );
    }
};