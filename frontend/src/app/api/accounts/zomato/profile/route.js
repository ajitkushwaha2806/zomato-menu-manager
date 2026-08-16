import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";

export async function GET(req) {
    try {
        const profileResponse = await apiClient({
            req,
            endpoint: "/restaurant-onboard-diy/check-auth",
            method: "GET",
        });

        if (!profileResponse?.loggedIn) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Unable to login. Please try again.",
                },
                { status: 401 }
            );
        }

        return NextResponse.json({
            success: true,
            data: profileResponse,
        });
    } catch (err) {
        return NextResponse.json(
            {
                success: false,
                message: err?.message ?? "Internal Server Error",
            },
            { status: 500 }
        );
    }
}
