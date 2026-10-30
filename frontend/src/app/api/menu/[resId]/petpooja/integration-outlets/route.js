import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/menu/[resId]/petpooja/integration-outlets
 * Fetches the integration outlets and channels from Petpooja:
 * /api/v1/menu/trigger/integration-outlets?mode=grid
 * 
 * Returns the list of available channels (Base Menu, Zomato, Swiggy, Dine In, etc.)
 * along with their mapped outlets, mappedId, last trigger status, and timestamps.
 */
export async function GET(req, { params }) {
    try {
        const { resId } = await params;

        // 1. Fetch current active session info (/api/v1/session/me)
        let sessionData = null;
        try {
            const sessionRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/session/me",
                method: "GET",
            });
            sessionData = sessionRes?.data || null;
        } catch (sessErr) {
            console.warn("Could not check /api/v1/session/me:", sessErr?.message);
        }

        // 3. Fetch integration outlets (/api/v1/menu/trigger/integration-outlets?mode=grid)
        const response = await petpoojaClient({
            req,
            endpoint: "/api/v1/menu/trigger/integration-outlets?mode=grid",
            method: "GET",
        });

        const rawList = response?.data || response || [];
        const channels = Array.isArray(rawList) ? rawList : [];

        // 4. Enrich channels with active status matching session/me
        const activePlatformSel = sessionData?.platformSelection || null;
        const enrichedChannels = channels.map((channel) => {
            const isBase = channel.userId === -1;
            let isActive = false;

            if (isBase && !activePlatformSel) {
                isActive = true;
            } else if (activePlatformSel && channel.userId === Number(activePlatformSel.clientId)) {
                isActive = true;
            }

            const enrichedOutlets = (channel.outlets || []).map((outlet) => {
                const isOutletActive = activePlatformSel &&
                    Number(activePlatformSel.clientId) === channel.userId &&
                    Number(activePlatformSel.mappedResId) === outlet.mappedId;

                return {
                    ...outlet,
                    isActive: !!isOutletActive,
                };
            });

            return {
                ...channel,
                isActive,
                outlets: enrichedOutlets,
            };
        });

        return NextResponse.json({
            success: true,
            data: enrichedChannels,
            session: sessionData,
            activePlatformSelection: activePlatformSel,
            activeMenuPlatform: activePlatformSel
                ? (activePlatformSel.name || activePlatformSel.clientName || "Online Platform")
                : "Base Menu (In-House)",
            restaurantId: sessionData?.restaurantId || String(resId),
        });
    } catch (error) {
        console.error("Petpooja Integration Outlets Error:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to fetch Petpooja integration outlets",
            },
            { status: 500 }
        );
    }
}

