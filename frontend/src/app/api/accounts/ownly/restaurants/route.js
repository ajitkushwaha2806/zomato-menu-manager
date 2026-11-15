import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Restaurant from "@/model/restaurant";
import { ownlyClient, extractOwnlyToken, extractPhoneFromJwt } from "@/lib/api/ownly-client";

export async function GET(req) {
    try {
        let liveStores = [];
        let apiError = null;

        // 1. Fetch live stores from Ownly init API
        try {
            const rawToken = req.headers.get("x-ownly-cookie") || "";
            const token = extractOwnlyToken(rawToken);
            const phone = extractPhoneFromJwt(token) || "9911584222";

            const res = await ownlyClient({
                req,
                endpoint: "/api/v1/init",
                method: "POST",
                data: { phoneNumber: phone },
            });

            if (res.data?.stores && Array.isArray(res.data.stores)) {
                liveStores = res.data.stores;
            }
        } catch (err) {
            console.error("Error calling Ownly /api/v1/init:", err.response?.data || err.message);
            apiError = err;
        }

        // 2. Map stores to standard entity format
        const entities = [];
        const seen = new Set();

        for (const store of liveStores) {
            const storeId = String(store.id || store.restaurantIdOnPos);
            seen.add(storeId);
            entities.push({
                id: storeId,
                name: store.name,
                subzone: store.area ? `${store.area}, ${store.city || "Bengaluru"}` : (store.city || "Bengaluru"),
                thumbnail: store.image || store.thumbnail || null,
                platform: "ownly",
                role: store.role,
                status: store.status,
                raw: store,
            });
        }

        // 3. Upsert into Restaurant collection & fallback to saved DB stores if offline
        try {
            await dbConnect();
            if (entities.length > 0) {
                await Promise.allSettled(
                    entities.map(e =>
                        Restaurant.findOneAndUpdate(
                            { resId: e.id },
                            {
                                resId: e.id,
                                name: e.name,
                                platform: "ownly",
                            },
                            { upsert: true, new: true }
                        )
                    )
                );
            }

            // Fallback: merge any DB restaurants with platform: 'ownly' that weren't returned by live API
            const dbRestaurants = await Restaurant.find({ platform: "ownly" }).lean();
            for (const r of dbRestaurants) {
                if (r.resId && !seen.has(String(r.resId))) {
                    seen.add(String(r.resId));
                    entities.push({
                        id: String(r.resId),
                        name: r.name || `Ownly Outlet #${r.resId}`,
                        subzone: "Saved in Database",
                        thumbnail: null,
                        platform: "ownly",
                        raw: r,
                    });
                }
            }
        } catch (dbErr) {
            console.warn("DB operation error in Ownly restaurants route:", dbErr.message);
        }

        if (!entities.length && apiError) {
            return NextResponse.json(
                {
                    success: false,
                    message: apiError.response?.data?.message || apiError.message || "Failed to fetch Ownly restaurants",
                },
                { status: apiError.response?.status || 500 }
            );
        }

        return NextResponse.json({
            success: true,
            entities,
            data: {
                stores: liveStores,
            },
        });
    } catch (err) {
        console.error("General error in Ownly restaurants route:", err);
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
    }
}
