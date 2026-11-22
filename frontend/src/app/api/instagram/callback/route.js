import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import InstagramAccount from "@/model/instagramAccount";
import { instagramService } from "@/lib/instagram/instagram.service";

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
    const appUrl = getAppUrl(req);
    let returnTo = "/";

    try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const error_description = url.searchParams.get("error_description");

        if (rawState) {
            try {
                const parsed = JSON.parse(rawState);
                returnTo = parsed.returnTo || "/";
            } catch {
                returnTo = rawState || "/";
            }
        }

        const buildResponse = (success, message, username = "") => {
            const redirectUrl = `${appUrl}${returnTo.startsWith("/") ? returnTo : `/${returnTo}`}${returnTo.includes("?") ? "&" : "?"}${success ? `ig_success=true&ig_user=${encodeURIComponent(username)}` : `ig_error=${encodeURIComponent(message)}`}`;

            // Return HTML page with postMessage for popup windows, plus fallback redirect
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Instagram Authorization</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa; }
        .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
        .icon { font-size: 40px; margin-bottom: 16px; }
        h2 { margin: 0 0 8px; font-size: 20px; color: ${success ? "#16a34a" : "#dc2626"}; }
        p { color: #666; font-size: 14px; margin: 0 0 20px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">${success ? "✅" : "❌"}</div>
        <h2>${success ? "Connected Successfully!" : "Connection Failed"}</h2>
        <p>${success ? `Instagram account @${username} linked successfully. Returning to app...` : message}</p>
    </div>
    <script>
        if (window.opener) {
            try {
                window.opener.postMessage({
                    type: "${success ? "INSTAGRAM_AUTH_SUCCESS" : "INSTAGRAM_AUTH_ERROR"}",
                    username: "${username}",
                    error: "${!success ? message : ""}"
                }, "*");
                setTimeout(() => window.close(), 1200);
            } catch(e) {
                window.location.href = "${redirectUrl}";
            }
        } else {
            setTimeout(() => { window.location.href = "${redirectUrl}"; }, 1000);
        }
    </script>
</body>
</html>
            `;
            return new Response(html, {
                status: success ? 200 : 400,
                headers: { "Content-Type": "text/html" },
            });
        };

        if (error) {
            console.error("[Instagram Callback Error]:", error, error_description);
            return buildResponse(false, error_description || error);
        }

        if (!code) {
            return buildResponse(false, "No authorization code returned from Instagram");
        }

        await dbConnect();

        const redirectUri = `${appUrl}/api/instagram/callback`;
        const instagramData = await instagramService.exchangeCodeForToken(code, redirectUri);

        // Upsert into InstagramAccount
        await InstagramAccount.findOneAndUpdate(
            { userId: instagramData.userId },
            {
                $set: {
                    username: instagramData.username,
                    accessToken: instagramData.accessToken,
                    tokenExpiresAt: instagramData.tokenExpiresAt,
                    connectedAt: new Date(),
                    isActive: true,
                },
            },
            { upsert: true, new: true }
        );

        return buildResponse(true, "Connected", instagramData.username);
    } catch (err) {
        console.error("[Instagram Callback Exception]:", err);
        return new Response(`
            <script>
                if (window.opener) {
                    window.opener.postMessage({ type: "INSTAGRAM_AUTH_ERROR", error: "${err.message}" }, "*");
                    window.close();
                } else {
                    window.location.href = "/?ig_error=${encodeURIComponent(err.message)}";
                }
            </script>
        `, { headers: { "Content-Type": "text/html" } });
    }
}

