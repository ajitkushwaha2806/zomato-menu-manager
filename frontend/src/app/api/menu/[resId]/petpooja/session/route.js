import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/menu/[resId]/petpooja/session
 * Hits /api/v1/session/me to check active restaurant & current platform selection (Swiggy, Zomato, or Base Menu).
 * Hits /api/v1/menu/trigger/integration-outlets?mode=grid to get all integration channels & outlets.
 */
export async function GET(req, { params }) {
    try {
        const { resId } = await params;

        // 1. Fetch active session info from Petpooja
        const sessionRes = await petpoojaClient({
            req,
            endpoint: "/api/v1/session/me",
            method: "GET",
        });

        let sessionData = sessionRes?.data || sessionRes || {};

        // Only switch restaurant if Petpooja session is currently on a different restaurant
        if (resId && sessionData?.restaurantId && String(sessionData.restaurantId) !== String(resId)) {
            try {
                await petpoojaClient({
                    req,
                    endpoint: "/api/v1/restaurants/select",
                    method: "POST",
                    data: { restaurant_id: String(resId) },
                });
                const refreshed = await petpoojaClient({
                    req,
                    endpoint: "/api/v1/session/me",
                    method: "GET",
                });
                sessionData = refreshed?.data || refreshed || sessionData;
            } catch (selErr) {
                console.warn("Could not switch restaurant in Petpooja session:", selErr?.message);
            }
        }

        const platformSelection = sessionData?.platformSelection || null;

        // 2. Fetch list of available integrated platforms & outlets
        let integrationOutlets = [];
        try {
            const intRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/trigger/integration-outlets?mode=grid",
                method: "GET",
            });
            integrationOutlets = intRes?.data || [];
        } catch (intErr) {
            console.warn("Could not fetch /api/v1/menu/trigger/integration-outlets:", intErr?.message);
        }

        // Filter integration outlets to ONLY show Zomato and Swiggy, with Zomato first
        const allowedOutlets = (Array.isArray(integrationOutlets) ? integrationOutlets : [])
            .filter((ch) => {
                const name = ch.name?.toLowerCase() || "";
                return name.includes("zomato") || name.includes("swiggy");
            })
            .sort((a, b) => {
                const aZomato = a.name?.toLowerCase().includes("zomato") ? 0 : 1;
                const bZomato = b.name?.toLowerCase().includes("zomato") ? 0 : 1;
                return aZomato - bZomato;
            });

        // 3. Determine active platform name by matching with integration outlets
        let currentClientId = Number(
            platformSelection?.client_id ??
            platformSelection?.clientId ??
            platformSelection?.userId
        );
        let currentMappedId = Number(
            platformSelection?.mapped_res_id ??
            platformSelection?.mappedResId ??
            platformSelection?.mappedId
        );

        let hasPlatformSelection = !isNaN(currentClientId) && currentClientId > 0 && !isNaN(currentMappedId) && currentMappedId > 0;

        // Verify if currently selected platform is one of the allowed platforms (Zomato or Swiggy)
        const isCurrentAllowed = allowedOutlets.some((ch) =>
            ch.userId === currentClientId &&
            (Array.isArray(ch.outlets) && ch.outlets.some((o) => o.mappedId === currentMappedId))
        );

        // Default set to Zomato if no selection, or if selection is not Zomato/Swiggy
        const zomatoChannel = allowedOutlets.find((ch) => ch.name?.toLowerCase().includes("zomato"));
        const zomatoOutlet = zomatoChannel?.outlets?.[0];

        if ((!hasPlatformSelection || !isCurrentAllowed) && zomatoChannel && zomatoOutlet) {
            try {
                await petpoojaClient({
                    req,
                    endpoint: "/api/v1/menu/platforms/select",
                    method: "POST",
                    data: {
                        client_id: zomatoChannel.userId,
                        mapped_res_id: zomatoOutlet.mappedId,
                    },
                });
                currentClientId = zomatoChannel.userId;
                currentMappedId = zomatoOutlet.mappedId;
                hasPlatformSelection = true;
            } catch (switchErr) {
                console.warn("Could not auto-select Zomato as default platform:", switchErr?.message);
            }
        }

        let activeMenuPlatform = "Zomato";
        if (hasPlatformSelection) {
            const matchedChannel = allowedOutlets.find((ch) => ch.userId === currentClientId);
            if (matchedChannel) {
                const matchedOutlet = (matchedChannel.outlets || []).find((o) => o.mappedId === currentMappedId);
                if (matchedOutlet && matchedOutlet.restaurantName) {
                    activeMenuPlatform = `${matchedChannel.name} - ${matchedOutlet.restaurantName}`;
                } else {
                    activeMenuPlatform = matchedChannel.name;
                }
            } else if (zomatoChannel) {
                activeMenuPlatform = zomatoChannel.name;
            }
        } else if (zomatoChannel) {
            activeMenuPlatform = zomatoChannel.name;
        }

        return NextResponse.json({
            success: true,
            data: {
                userId: sessionData.userId || null,
                restaurantId: sessionData.restaurantId || String(resId),
                platformSelection: hasPlatformSelection ? {
                    clientId: currentClientId,
                    client_id: currentClientId,
                    mappedResId: currentMappedId,
                    mapped_res_id: currentMappedId,
                    name: activeMenuPlatform,
                } : null,
                activeMenuPlatform: activeMenuPlatform,
                isBaseMenu: false,
                integrationOutlets: allowedOutlets,
                session: sessionData,
            },
        });
    } catch (error) {
        console.error("Petpooja Session Fetch Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to fetch Petpooja session details",
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/menu/[resId]/petpooja/session
 * Switches the active menu platform on Petpooja (e.g. Swiggy, Zomato, or Base Menu)
 * by calling POST /api/v1/menu/platforms/select.
 * 
 * Payload: { client_id: number, mapped_res_id: number, reset?: boolean }
 */
export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json();
        const { client_id, mapped_res_id, reset } = body;

        let selectResult = null;

        if (reset || Number(client_id) === -1 || Number(client_id) === 0) {
            // Reset to base menu
            try {
                selectResult = await petpoojaClient({
                    req,
                    endpoint: "/api/v1/menu/platforms/select",
                    method: "POST",
                    data: { client_id: -1, mapped_res_id: -1 },
                });
            } catch (e) {
                selectResult = await petpoojaClient({
                    req,
                    endpoint: "/api/v1/menu/platforms/select",
                    method: "POST",
                    data: { client_id: 0, mapped_res_id: 0 },
                });
            }
        } else if (client_id && mapped_res_id) {
            // Select online outlet/platform
            selectResult = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/platforms/select",
                method: "POST",
                data: {
                    client_id: Number(client_id),
                    mapped_res_id: Number(mapped_res_id),
                },
            });
        }

        // 1. Fetch updated session state
        let sessionData = {};
        try {
            const sessionRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/session/me",
                method: "GET",
            });
            sessionData = sessionRes?.data || sessionRes || {};
        } catch (sessErr) {
            console.warn("Could not reload session/me:", sessErr?.message);
        }

        // 2. Fetch integration outlets to resolve names
        let integrationOutlets = [];
        try {
            const intRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/trigger/integration-outlets?mode=grid",
                method: "GET",
            });
            integrationOutlets = intRes?.data || [];
        } catch (e) {}

        // 3. Determine active platform selection reliably
        const isReset = reset || Number(client_id) === -1 || Number(client_id) === 0;
        const rawSelection = (!isReset && client_id && mapped_res_id)
            ? (selectResult?.data?.selection || sessionData?.platformSelection || { client_id, mapped_res_id })
            : sessionData?.platformSelection;

        const currentClientId = isReset ? -1 : Number(
            rawSelection?.client_id ??
            rawSelection?.clientId ??
            rawSelection?.userId ??
            client_id
        );
        const currentMappedId = isReset ? -1 : Number(
            rawSelection?.mapped_res_id ??
            rawSelection?.mappedResId ??
            rawSelection?.mappedId ??
            mapped_res_id
        );

        let activeMenuPlatform = "Base Menu (In-House)";
        const hasPlatformSelection = !isReset && !isNaN(currentClientId) && currentClientId > 0 && !isNaN(currentMappedId) && currentMappedId > 0;

        if (hasPlatformSelection) {
            const matchedChannel = (Array.isArray(integrationOutlets) ? integrationOutlets : []).find(
                (ch) => ch.userId === currentClientId
            );

            if (matchedChannel) {
                const matchedOutlet = (matchedChannel.outlets || []).find(
                    (o) => o.mappedId === currentMappedId
                );
                if (matchedOutlet && matchedOutlet.restaurantName) {
                    activeMenuPlatform = `${matchedChannel.name} - ${matchedOutlet.restaurantName}`;
                } else {
                    activeMenuPlatform = matchedChannel.name;
                }
            } else {
                activeMenuPlatform = selectResult?.data?.selection?.restaurant_area_name || rawSelection?.restaurant_area_name || rawSelection?.name || "Online Platform";
            }
        }

        return NextResponse.json({
            success: true,
            message: `Switched Petpooja to ${activeMenuPlatform}`,
            data: {
                restaurantId: sessionData.restaurantId || String(resId),
                platformSelection: hasPlatformSelection ? {
                    clientId: currentClientId,
                    client_id: currentClientId,
                    mappedResId: currentMappedId,
                    mapped_res_id: currentMappedId,
                    name: activeMenuPlatform,
                } : null,
                selection: selectResult?.data?.selection || null,
                activeMenuPlatform: activeMenuPlatform,
                isBaseMenu: !hasPlatformSelection,
                integrationOutlets: Array.isArray(integrationOutlets) ? integrationOutlets : [],
                session: sessionData,
            },
        });
    } catch (error) {
        console.error("Petpooja Platform Switch Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to switch Petpooja menu platform",
            },
            { status: 500 }
        );
    }
}
