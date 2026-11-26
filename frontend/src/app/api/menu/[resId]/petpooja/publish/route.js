import { NextResponse } from "next/server";
import { petpoojaClient } from "@/lib/api/petpooja-client";
import Trigger from "@/model/trigger";
import MenuSync from "@/model/menu-sync";
import dbConnect from "@/lib/dbConnect";
import { getRestaurantName } from "@/lib/restaurantResolver";

export const dynamic = "force-dynamic";

/**
 * POST /api/menu/[resId]/petpooja/publish
 * Triggers menu publish directly to aggregators (Zomato / Swiggy) via Petpooja.
 * Endpoint: POST https://new-menu-be.petpooja.com/api/v1/menu/trigger/publish
 * Payload:
 * {
 *   "integrations": [
 *     {
 *       "userId": 5409,
 *       "outlets": [
 *         { "rid": 460894, "clientRestaurantId": "y0zj9hvme4" }
 *       ]
 *     }
 *   ]
 * }
 */
export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json().catch(() => ({}));

        let integrations = body.integrations;

        // If explicit integrations array is not provided, resolve dynamically from Petpooja
        if (!Array.isArray(integrations) || integrations.length === 0) {
            const intRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/menu/trigger/integration-outlets?mode=grid",
                method: "GET",
            });

            const allChannels = Array.isArray(intRes?.data)
                ? intRes.data
                : (Array.isArray(intRes) ? intRes : []);

            let targetPlatform = body.platform ? String(body.platform).toLowerCase() : null;
            let targetUserId = body.userId ? Number(body.userId) : null;
            let targetMappedId = body.mappedId || body.mappedResId ? Number(body.mappedId || body.mappedResId) : null;

            // If no target specified, inspect active session platform selection
            if (!targetPlatform && !targetUserId) {
                try {
                    const sessionRes = await petpoojaClient({
                        req,
                        endpoint: "/api/v1/session/me",
                        method: "GET",
                    });
                    const sess = sessionRes?.data || sessionRes;
                    const platSel = sess?.platformSelection;
                    if (platSel?.clientId || platSel?.client_id) {
                        targetUserId = Number(platSel.clientId || platSel.client_id);
                        targetMappedId = Number(platSel.mappedResId || platSel.mapped_res_id);
                    }
                } catch (sErr) {
                    console.warn("Could not inspect /session/me for default platform:", sErr?.message);
                }
            }

            // Filter channels to publish to
            let matchedChannels = [];
            if (targetPlatform === "all") {
                matchedChannels = allChannels.filter(ch => {
                    const name = ch.name?.toLowerCase() || "";
                    return name.includes("zomato") || name.includes("swiggy");
                });
            } else if (targetUserId) {
                matchedChannels = allChannels.filter(ch => ch.userId === targetUserId);
            } else if (targetPlatform) {
                matchedChannels = allChannels.filter(ch => (ch.name?.toLowerCase() || "").includes(targetPlatform));
            } else {
                // Default to Zomato channel if available, otherwise first aggregator channel
                const zomato = allChannels.find(ch => (ch.name?.toLowerCase() || "").includes("zomato"));
                if (zomato) {
                    matchedChannels = [zomato];
                } else {
                    const swiggy = allChannels.find(ch => (ch.name?.toLowerCase() || "").includes("swiggy"));
                    if (swiggy) matchedChannels = [swiggy];
                }
            }

            if (matchedChannels.length === 0) {
                return NextResponse.json(
                    {
                        success: false,
                        message: "No matching integration aggregator platform found on Petpooja to publish.",
                    },
                    { status: 400 }
                );
            }

            // Construct payload
            integrations = matchedChannels.map(channel => {
                let channelOutlets = Array.isArray(channel.outlets) ? channel.outlets : [];
                if (targetMappedId) {
                    const matched = channelOutlets.filter(o => o.mappedId === targetMappedId);
                    if (matched.length > 0) channelOutlets = matched;
                }

                return {
                    userId: channel.userId,
                    outlets: channelOutlets.map(outlet => ({
                        rid: Number(outlet.restaurantId || resId),
                        clientRestaurantId: String(outlet.clientRestaurantId || ""),
                    })),
                };
            }).filter(item => item.outlets.length > 0);
        }

        if (integrations.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: "No active outlets configured for publication on the selected platform.",
                },
                { status: 400 }
            );
        }

        console.log(`[Petpooja Trigger Publish] Publishing to Petpooja for restaurant ${resId}:`, JSON.stringify({ integrations }));

        const publishRes = await petpoojaClient({
            req,
            endpoint: "/api/v1/menu/trigger/publish",
            method: "POST",
            data: { integrations },
        });

        console.log("[Petpooja Trigger Publish] Response:", publishRes);

        const resMessage = publishRes?.message || publishRes?.msg || "Menu publish triggered successfully on aggregator!";

        try {
            await dbConnect();
            const restaurantName = await getRestaurantName(resId, body?.restaurantName);
            const userName = body?.userName || body?.user || "Team Member";
            const userEmail = body?.userEmail || "";

            await Trigger.create({
                resId: String(resId),
                restaurantName,
                platform: "petpooja",
                taskId: body?.taskId || "PETPOOJA_PUBLISH",
                status: "SUCCESS",
                user: userName,
                userEmail,
                actionType: "PETPOOJA_PUBLISH",
            });

            await MenuSync.create({
                resId: String(resId),
                restaurantName,
                platform: "petpooja",
                accountName: body?.accountName || "Petpooja",
                status: "completed",
                user: userName,
                userEmail,
                updated_menu: { integrations },
            });
        } catch (dbErr) {
            console.warn("Could not log Petpooja publish trigger/sync:", dbErr?.message);
        }

        return NextResponse.json({
            success: true,
            message: resMessage,
            data: publishRes?.data || publishRes,
            integrations,
        });

    } catch (error) {
        console.error("Petpooja Menu Trigger Publish Error:", error);
        const errMsg = error?.detailedError || error?.response?.data?.message || error?.message || "Failed to trigger menu publish on Petpooja";

        try {
            await dbConnect();
            const restaurantName = await getRestaurantName((await params)?.resId, body?.restaurantName);
            const userName = body?.userName || body?.user || "Team Member";
            const userEmail = body?.userEmail || "";

            await Trigger.create({
                resId: String((await params)?.resId),
                restaurantName,
                platform: "petpooja",
                taskId: body?.taskId || "PETPOOJA_PUBLISH",
                status: "FAILED",
                user: userName,
                userEmail,
                actionType: "PETPOOJA_PUBLISH",
                error: errMsg,
            });
        } catch (dbErr) {
            console.warn("Could not log failed Petpooja trigger:", dbErr?.message);
        }

        return NextResponse.json(
            {
                success: false,
                message: errMsg,
                details: error?.response?.data || null,
            },
            { status: error?.status || error?.response?.status || 500 }
        );
    }
}

