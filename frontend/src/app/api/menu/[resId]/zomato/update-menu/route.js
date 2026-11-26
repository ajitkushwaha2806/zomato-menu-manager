import Menu from "@/model/menu"
import Trigger from "@/model/trigger"
import MenuSync from "@/model/menu-sync"
import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import { buildZomatoMenuPayload } from "@/lib/payload/zomato/menu";
import { getRestaurantName } from "@/lib/restaurantResolver";

const SECRET_UNLOCK_KEY = "142004312005";

export async function POST(req, { params }) {
    let resId = "";
    let body = {};
    try {
        ({ resId } = await params);
        
        try {
            body = await req.json();
        } catch (e) {
            body = {};
        }
        
        const { taskId } = body;

        if (!resId) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Restaurant ID is required",
                },
                { status: 400 }
            );
        }

        if (taskId && String(taskId).trim() !== SECRET_UNLOCK_KEY) {
            await Menu.findOneAndUpdate(
                { resId, platform: 'zomato' },
                { $set: { taskId } },
                { upsert: true }
            );
        }

        const resMenu = await Menu.findOne({ resId, platform: 'zomato' });

        // Check if any item or menu has addons for Zomato
        const menuCategories = Array.isArray(resMenu?.menu) ? resMenu.menu : [];
        const dbAddons = Array.isArray(resMenu?.addons) ? resMenu.addons : [];

        let itemsWithAddons = [];
        menuCategories.forEach(cat => {
            if (cat.status === 'delete' || cat.status === 'deleted') return;
            (cat.sub_category || []).forEach(sub => {
                if (sub.status === 'delete' || sub.status === 'deleted') return;
                (sub.items || []).forEach(item => {
                    if (item.status === 'delete' || item.status === 'deleted') return;
                    const hasAddons = (Array.isArray(item.addons) && item.addons.length > 0) ||
                        (Array.isArray(item.addon_groups) && item.addon_groups.length > 0) ||
                        (Array.isArray(item.addonGroups) && item.addonGroups.length > 0);
                    if (hasAddons) {
                        itemsWithAddons.push(item.name || "Unnamed Item");
                    }
                });
            });
        });

        if (itemsWithAddons.length > 0 || dbAddons.length > 0) {
            const detail = itemsWithAddons.length > 0
                ? `${itemsWithAddons.length} item(s) have addons attached (${itemsWithAddons.slice(0, 3).join(", ")}${itemsWithAddons.length > 3 ? "..." : ""})`
                : `${dbAddons.length} addon group(s) exist`;
            return NextResponse.json(
                {
                    success: false,
                    message: `Cannot trigger menu: Addons are present. ${detail}. Please delete all addons first before triggering.`,
                },
                { status: 400 }
            );
        }

        const menuInfo = await apiClient({
            req,
            endpoint: "/php/online_ordering/menu_edit",
            method: "GET",
            params: {
                action: "get_menu_info",
                service_role: "DELIVERY_TAKEAWAY",
                res_id: resId,
            },
        });

        if (!menuInfo?.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: menuInfo?.message || "Failed to fetch menu info",
                },
                { status: menuInfo?.status || 500 }
            );
        }

        const menuVersion = menuInfo?.data?.menuVersion;

        if (!menuVersion) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Menu version not found",
                },
                { status: 400 }
            );
        }

        const result = await apiClient({
            req,
            endpoint: "/php/online_ordering/menu_edit",
            method: "GET",
            params: {
                action: "get_content_menu",
                res_id: resId,
                service_role: "DELIVERY_TAKEAWAY",
            },
        });

        if (!result?.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: result?.message || "Failed to fetch menu",
                },
                { status: result?.status || 500 }
            );
        }

        console.log("result", result)

        const menu = result?.data ?? null;

        // const payload = buildZomatoMenuPayload({
        // resId,
        // menuVersion,
        // last_opened_catalogue: menu?.last_opened_catalogue || [],
        // onHoldItem: menu?.onHoldItem || [],
        // update_menu: menu
        // });

        const payload = {
            resId: String(resId),
            menuVersion,
            last_opened_catalogue: menu?.last_opened_catalogue || {},
            onHoldItems: menu?.onHoldItems || {},
            update_menu: buildZomatoMenuPayload(menu?.menuResponse, resMenu?.menu || [], resMenu?.addons || []),
            menu: menu?.menuResponse
        }

        // return NextResponse.json(
        //     {
        //         success: true,
        //         message: "Menu updated successfully",
        //         result: payload?.update_menu,
        //         data: menu,
        //     },
        //     { status: 200 }
        // );

        const updatedMenu = await apiClient({
            req,
            endpoint: "/php/online_ordering/menu_edit",
            method: "POST",
            params: {
                action: "update_content_menu",
                service_role: "DELIVERY_TAKEAWAY",
                resId: resId
            },
            data: {
                ...payload,
            },
        });

        if (!updatedMenu?.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: updatedMenu?.message || "Menu update failed",
                },
                { status: result?.status || 500 }
            );
        }

        const restaurantName = await getRestaurantName(resId, body.restaurantName || resMenu?.name);
        const userName = body.userName || body.user || "Team Member";
        const userEmail = body.userEmail || "";
        const effectiveTaskId = taskId || "OTP_VERIFIED";

        try {
            await Trigger.create({
                resId: String(resId),
                restaurantName,
                platform: "zomato",
                taskId: effectiveTaskId,
                status: "SUCCESS",
                user: userName,
                userEmail,
                actionType: "MENU_TRIGGER",
            });
        } catch (tErr) {
            console.warn("Could not log Zomato trigger:", tErr?.message);
        }

        await MenuSync.create({
            resId: String(resId),
            restaurantName,
            platform: "zomato",
            status: "completed",
            taskId: effectiveTaskId,
            user: userName,
            userEmail,
            updated_menu: payload?.update_menu || {},
        });

        return NextResponse.json(
            {
                success: true,
                message: "Menu updated successfully",
                updated_menu: updatedMenu,
                data: payload?.update_menu,
                result: result?.data,
            },
            { status: 200 }
        );
    } catch (err) {
        console.error("MENU_UPDATE_ERROR:", err);

        const restaurantName = await getRestaurantName(resId, body?.restaurantName);
        const userName = body?.userName || body?.user || "Team Member";
        const userEmail = body?.userEmail || "";
        const effectiveTaskId = body?.taskId || "OTP_VERIFIED";

        try {
            await Trigger.create({
                resId: String(resId),
                restaurantName,
                platform: "zomato",
                taskId: effectiveTaskId,
                status: "FAILED",
                user: userName,
                userEmail,
                actionType: "MENU_TRIGGER",
                error: err?.response?.data?.message || err?.message || "Internal Server Error",
            });
        } catch (tErr) {
            console.warn("Could not log failed Zomato trigger:", tErr?.message);
        }

        try {
            await MenuSync.create({
                resId: String(resId),
                restaurantName,
                platform: "zomato",
                status: "failed",
                taskId: effectiveTaskId,
                user: userName,
                userEmail,
                updated_menu: {},
                error: err?.response?.data?.message || err?.message || "Internal Server Error",
            });
        } catch (sErr) {
            console.warn("Could not log failed Zomato sync:", sErr?.message);
        }

        return NextResponse.json(
            {
                success: false,
                message:
                    err?.response?.data?.message ||
                    err?.message ||
                    "Internal Server Error",
            },
            { status: err?.response?.status || 500 }
        );
    }
}