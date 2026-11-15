import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { password } = body;

        const expectedPassword = (process.env.APP_PASSWORD || "!@#$%^&*()").trim();

        if (!password || String(password).trim() !== expectedPassword) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Incorrect application password. Please try again.",
                },
                { status: 401 }
            );
        }

        const response = NextResponse.json({
            success: true,
            message: "Application unlocked successfully.",
        });

        // Set 30-day unlock cookie
        response.cookies.set("app_unlocked", "true", {
            path: "/",
            maxAge: 30 * 24 * 60 * 60, // 30 days
            sameSite: "lax",
            httpOnly: false,
        });

        return response;
    } catch (error) {
        console.error("Error verifying app password:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error." },
            { status: 500 }
        );
    }
}

