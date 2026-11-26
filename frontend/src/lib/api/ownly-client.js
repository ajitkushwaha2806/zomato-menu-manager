import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import OwnlyAccount from "@/model/ownlyAccount.js";

export function extractOwnlyToken(rawInput) {
    if (!rawInput) return null;
    let input = String(rawInput).trim();

    // If it's a full header line like "authorization: Bearer eyJ..."
    const authHeaderMatch = input.match(/authorization:\s*(?:Bearer\s+)?([A-Za-z0-9_\-\.]+)/i);
    if (authHeaderMatch) {
        return authHeaderMatch[1];
    }

    // If it starts with "Bearer "
    if (input.toLowerCase().startsWith("bearer ")) {
        return input.slice(7).trim();
    }

    // If it's a cookie string with token=... or auth=...
    const cookieTokenMatch = input.match(/(?:token|auth|access_token|jwt|authorization)=([^;]+)/i);
    if (cookieTokenMatch) {
        let t = cookieTokenMatch[1].trim();
        if (t.toLowerCase().startsWith("bearer%20") || t.toLowerCase().startsWith("bearer ")) {
            t = t.slice(t.indexOf(" ") + 1).trim();
        }
        return t;
    }

    // If it's a direct JWT token (starts with eyJ...)
    const jwtMatch = input.match(/(eyJ[A-Za-z0-9_\-\.]+\.[A-Za-z0-9_\-\.]+\.[A-Za-z0-9_\-]+)/);
    if (jwtMatch) {
        return jwtMatch[1];
    }

    return input;
}

export function extractPhoneFromJwt(jwtToken) {
    try {
        if (!jwtToken || !jwtToken.includes(".")) return null;
        const parts = jwtToken.split(".");
        if (parts.length >= 2) {
            const payloadStr = Buffer.from(parts[1], "base64").toString("utf8");
            const payload = JSON.parse(payloadStr);
            return payload?.user?.phone || payload?.phoneNumber || payload?.phone || null;
        }
    } catch (e) {
        // failed to parse
    }
    return null;
}

const outletRolesCache = new Map();

export async function resolveOwnlyOutletRoles(token, customDeviceId = "6722be1c-499a-42fe-a45e-14a1674cf481") {
    if (!token) return null;
    const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
    const cached = outletRolesCache.get(cleanToken);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        return cached.roles;
    }

    const phone = extractPhoneFromJwt(cleanToken) || "8130205579";
    try {
        const initRes = await axios({
            url: "https://rxapi.ownly.food/api/v1/init",
            method: "POST",
            data: { phoneNumber: phone },
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "app-version": "0.42.1",
                "build-number": "51",
                "project-version": "51",
                appid: "200",
                authorization: `Bearer ${cleanToken}`,
                "device-id": customDeviceId,
                platform: "WEB",
                origin: "https://partner.ownly.food",
                referer: "https://partner.ownly.food/"
            },
            timeout: 8000
        });

        const stores = initRes.data?.stores || [];
        if (stores.length > 0) {
            const roleGroups = {};
            for (const store of stores) {
                const code = store.roleCode || (store.role === "Manager" ? 1 : 2);
                const rawId = String(store.id || store.restaurantIdOnPos || "");
                const numericId = rawId.replace(/^[A-Za-z]+/, "");
                if (numericId) {
                    if (!roleGroups[code]) roleGroups[code] = [];
                    roleGroups[code].push(numericId);
                }
            }
            const parts = Object.entries(roleGroups).map(([code, ids]) => `${code}:${ids.join(",")}`);
            if (parts.length > 0) {
                const outletRoles = `v1.${parts.join(";")}`;
                outletRolesCache.set(cleanToken, { roles: outletRoles, timestamp: Date.now() });
                return outletRoles;
            }
        }
    } catch (err) {
        console.warn("[Ownly Client] Could not fetch init for x-outlet-roles:", err.message);
    }
    return null;
}

export async function ownlyClient({
    req,
    baseURL = process.env.OWNLY_API_BASE_URL || "https://rxapi.ownly.food",
    endpoint,
    method = "GET",
    data,
    params,
    headers = {},
    rawToken,
    accountName,
}) {
    let tokenInput = rawToken || (req?.headers?.get ? req.headers.get("x-ownly-cookie") : req?.headers?.["x-ownly-cookie"]) || "";
    const effectiveAccountName = accountName || (req?.headers?.get ? req.headers.get("x-ownly-account") : req?.headers?.["x-ownly-account"]);

    if (!tokenInput) {
        try {
            await dbConnect();
            if (effectiveAccountName) {
                const account = await OwnlyAccount.findOne({ name: effectiveAccountName });
                if (account?.cookie) tokenInput = account.cookie;
            }
            if (!tokenInput) {
                const latestAccount = await OwnlyAccount.findOne().sort({ updatedAt: -1 });
                if (latestAccount?.cookie) tokenInput = latestAccount.cookie;
            }
        } catch (dbErr) {
            console.warn("Could not query OwnlyAccount from database:", dbErr?.message);
        }
    }

    const token = extractOwnlyToken(tokenInput);

    if (!token) {
        throw new Error("No Ownly token/cookie found. Please connect an Ownly account.");
    }

    const isFormData = data && (typeof data.getHeaders === "function" || (typeof FormData !== "undefined" && data instanceof FormData));
    const formHeaders = (data && typeof data.getHeaders === "function") ? data.getHeaders() : {};

    let outletRoles = headers?.["x-outlet-roles"] || headers?.["X-Outlet-Roles"];
    if (!outletRoles && (endpoint.includes("item-attributes") || endpoint.includes("/menu/item"))) {
        outletRoles = await resolveOwnlyOutletRoles(token);
    }

    const defaultHeaders = {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "app-version": "0.42.1",
        appid: "200",
        authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "build-number": "51",
        "cache-control": "no-cache",
        city: "Bengaluru",
        ...(!isFormData ? { "content-type": "application/json" } : {}),
        "device-id": "6722be1c-499a-42fe-a45e-14a1674cf481",
        ...(outletRoles ? { "x-outlet-roles": outletRoles } : {}),
        language: "en",
        origin: "https://partner.ownly.food",
        platform: "WEB",
        pragma: "no-cache",
        priority: "u=1, i",
        "project-version": "51",
        referer: "https://partner.ownly.food/",
        "screen-height": "801",
        "screen-size": "expanded",
        "screen-width": "906",
        "sec-ch-ua": '"Not-A.Brand";v="99", "Google Chrome";v="157", "Chromium";v="157"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        thememode: "dark",
        themename: "app",
        "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
        ...formHeaders,
        ...headers,
    };

    return await axios({
        baseURL,
        url: endpoint,
        method,
        data,
        params,
        headers: defaultHeaders,
        timeout: 30000,
    });
}

