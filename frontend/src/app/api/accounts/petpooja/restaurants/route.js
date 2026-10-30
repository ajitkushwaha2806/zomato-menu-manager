import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Menu from "@/model/menu";
import { petpoojaClient } from "@/lib/api/petpooja-client";

function flattenHierarchy(node) {
    if (!node) return [];
    if (Array.isArray(node)) {
        return node.flatMap(flattenHierarchy);
    }
    if (typeof node !== "object") return [];

    const list = [];
    if (node.id && (node.name || node.rest_name || node.outlet_name)) {
        list.push({
            id: String(node.id),
            name: node.name || node.rest_name || node.outlet_name,
            subzone: node.subzone || node.area || node.city || (node.type === "R" ? "Restaurant" : "Petpooja Outlet"),
            thumbnail: node.thumbnail || node.image || null,
            type: node.type || "R",
            selected: !!node.selected,
            platform: "petpooja",
            raw: node,
        });
    }

    for (const key of ["children", "restaurants", "outlets", "child_nodes", "data", "entities", "sub_outlets"]) {
        if (Array.isArray(node[key])) {
            list.push(...flattenHierarchy(node[key]));
        }
    }

    return list;
}

export async function GET(req) {
    try {
        let liveEntities = [];
        let rawResponse = null;
        let apiError = null;
        let sessionData = null;

        // Fetch current active session info from Petpooja
        try {
            const sessionRes = await petpoojaClient({
                req,
                endpoint: "/api/v1/session/me",
                method: "GET",
            });
            sessionData = sessionRes?.data || null;
        } catch (sessErr) {
            console.warn("Could not fetch /api/v1/session/me:", sessErr?.message);
        }

        try {
            rawResponse = await petpoojaClient({
                req,
                endpoint: "/api/v1/restaurants/hierarchy",
                method: "GET",
            });
            liveEntities = flattenHierarchy(rawResponse);
        } catch (err) {
            apiError = err;
            console.error("Petpooja API error fetching hierarchy:", err.message);
        }

        // Deduplicate live entities by id and mark active selection if matching session restaurantId
        const activeResId = sessionData?.restaurantId ? String(sessionData.restaurantId) : null;
        const seen = new Set();
        const entities = [];
        for (const entity of liveEntities) {
            if (!seen.has(entity.id)) {
                seen.add(entity.id);
                if (activeResId && entity.id === activeResId) {
                    entity.selected = true;
                }
                entities.push(entity);
            }
        }

        // Also merge any existing DB Petpooja restaurants not yet in live list
        try {
            await dbConnect();
            const dbRestaurants = await Menu.find({ platform: "petpooja" }).lean();
            for (const r of dbRestaurants) {
                if (r.resId && !seen.has(String(r.resId))) {
                    seen.add(String(r.resId));
                    entities.push({
                        id: String(r.resId),
                        name: r.name || "Petpooja Outlet",
                        subzone: "Saved in Database",
                        thumbnail: null,
                        type: "R",
                        selected: activeResId ? String(r.resId) === activeResId : false,
                        platform: "petpooja",
                        raw: r,
                    });
                }
            }
        } catch (dbErr) {
            console.warn("Could not query DB for fallback petpooja restaurants:", dbErr?.message);
        }

        if (!entities.length && apiError) {
            return NextResponse.json(
                {
                    success: false,
                    message: apiError.message || "Failed to fetch Petpooja restaurants",
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entities: entities,
            session: sessionData,
            activeRestaurantId: activeResId,
            platformSelection: sessionData?.platformSelection || null,
            data: {
                data: entities,
                raw: rawResponse,
                session: sessionData,
            },
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            {
                success: false,
                message: err?.message ?? "Internal Server Error",
            },
            { status: 500 }
        );
    }
}

