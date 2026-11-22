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

    const defaultHeaders = {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "app-version": "0.40.1",
        appid: "200",
        authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
        "build-number": "48",
        "cache-control": "no-cache",
        city: "Bengaluru",
        ...(!isFormData ? { "content-type": "application/json" } : {}),
        "device-id": "6722be1c-499a-42fe-a45e-14a1674cf481",
        language: "en",
        origin: "https://partner.ownly.food",
        platform: "WEB",
        pragma: "no-cache",
        priority: "u=1, i",
        "project-version": "48",
        referer: "https://partner.ownly.food/",
        "screen-height": "800",
        "screen-size": "compact",
        "screen-width": "360",
        "sec-ch-ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        thememode: "light",
        themename: "app",
        "user-agent":
            "Mozilla/5.0 (Linux; Android 14; SM-A556B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36",
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

