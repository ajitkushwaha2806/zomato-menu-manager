import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getAppUrl(req) {
    if (process.env.NEXT_PUBLIC_BASE_URL) {
        return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
    }
    const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:2000";
    const forwardedProto = req.headers.get("x-forwarded-proto") || (forwardedHost.includes("localhost") ? "http" : "https");
    return `${forwardedProto}://${forwardedHost}`;
}

export async function GET(req) {
    try {
        const clientId = process.env.INSTAGRAM_CLIENT_ID;
        if (!clientId) {
            return NextResponse.json(
                { success: false, message: "INSTAGRAM_CLIENT_ID is not configured in .env" },
                { status: 400 }
            );
        }

        const appUrl = getAppUrl(req);
        const redirectUri = `${appUrl}/api/instagram/callback`;
        const url = new URL(req.url);
        const returnTo = url.searchParams.get("returnTo") || "/";

        const state = JSON.stringify({ returnTo });
        const authUrl = new URL("https://www.instagram.com/oauth/authorize");
        authUrl.searchParams.append("client_id", clientId);
        authUrl.searchParams.append("redirect_uri", redirectUri);
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append(
            "scope",
            "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish"
        );
        authUrl.searchParams.append("state", state);

        return NextResponse.json({
            success: true,
            url: authUrl.toString(),
        });
    } catch (error) {
        console.error("[Instagram Auth Error]:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Failed to generate Instagram OAuth URL" },
            { status: 500 }
        );
    }
}

