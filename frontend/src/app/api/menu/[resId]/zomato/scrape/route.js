import axios from "axios";
import Menu from "@/model/menu";
import dbConnect from "@/lib/dbConnect";
import { NextResponse } from "next/server";

import crypto from "crypto";

const generateTempId = () => `temp-${crypto.randomUUID()}`;

const parseVariantGroups = (groups) => {
    if (!Array.isArray(groups) || groups.length === 0) {
        return [];
    }

    return groups
        .map((groupWrapper) => {
            const group = groupWrapper?.group;

            if (!group) return null;

            return {
                property_name: group?.name || group?.label || "",
                property_id: generateTempId(),

                options: Array.isArray(group?.items)
                    ? group.items.map((itemWrapper) => {
                        const option = itemWrapper?.item || {};

                        return {
                            option_name: option?.name || "",
                            option_id: generateTempId(),
                            variant_id: generateTempId(),
                            price: option?.price || 0,
                            is_default: !!option?.is_default,
                        };
                    })
                    : [],
            };
        })
        .filter(Boolean);
};

export const GET = async (req, { params }) => {
    try {
        await dbConnect()
        const { searchParams } = new URL(req.url);
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


        const pageUrlParam = searchParams.get("pageUrl");
        if (!pageUrlParam) {
            return NextResponse.json(
                {
                    success: false,
                    message: "pageUrl is required",
                },
                { status: 400 }
            );
        }

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

        const pageUrl = getNomalisedUrl(pageUrlParam);

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
                    "accept-language":
                        "en-GB,en-US;q=0.9,en;q=0.8",
                    "user-agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
                },
            }
        );

        const menus =
            response?.data?.page_data?.order?.menuList?.menus || [];

        const parsedMenu = menus.map((menuWrapper) => {
            const menu = menuWrapper?.menu || {};

            return {
                id: generateTempId(),
                name: menu?.name || "",
                temp_id: "",

                sub_category: (menu?.categories || []).map(
                    (categoryWrapper) => {
                        const category =
                            categoryWrapper?.category || {};

                        return {
                            id: generateTempId(),
                            temp_id: "",

                            name:
                                category?.name?.trim() ||
                                "nota",

                            items: (category?.items || []).map(
                                (itemWrapper) => {
                                    const item =
                                        itemWrapper?.item || {};

                                    return {
                                        id: generateTempId(),
                                        temp_id: "",

                                        name:
                                            item?.name || "",

                                        description:
                                            item?.desc || "",

                                        price:
                                            item?.price ||
                                            item?.default_price ||
                                            item?.display_price ||
                                            item?.min_price ||
                                            0,

                                        min_price:
                                            item?.min_price || 0,

                                        max_price:
                                            item?.max_price || 0,

                                        is_veg:
                                            item?.dietary_slugs?.includes(
                                                "veg"
                                            )
                                                ? "VEG"
                                                : "NON_VEG",

                                        packing_charges: 0,

                                        media: item?.media,

                                        variants:
                                            parseVariantGroups(
                                                item?.groups
                                            ),
                                    };
                                }
                            ),
                        };
                    }
                ),
            };
        });

        const savedMenu = await Menu.findOneAndUpdate(
            {
                resId,
                platform: "zomato",
            },
            {
                resId,
                platform: "zomato",
                menu: parsedMenu,
                updatedAt: new Date(),
            },
            {
                new: true,
                upsert: true,
            }
        );

        const totalItems = parsedMenu.reduce(
            (count, category) =>
                count +
                category.sub_category.reduce(
                    (subCount, sub) =>
                        subCount + sub.items.length,
                    0
                ),
            0
        );

        return NextResponse.json({
            success: true,
            menuId: savedMenu._id,
            total_categories: parsedMenu.length,
            total_items: totalItems,
            parsedData: parsedMenu,
        });
    } catch (error) {
        console.error(
            "Zomato Menu Parse Error:",
            error?.response?.data || error
        );

        return NextResponse.json(
            {
                success: false,
                message:
                    error?.response?.data?.message ||
                    error?.message ||
                    "Failed to fetch menu",
            },
            {
                status:
                    error?.response?.status || 500,
            }
        );
    }
};