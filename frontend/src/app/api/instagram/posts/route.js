import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import InstagramAccount from "@/model/instagramAccount";
import { instagramService } from "@/lib/instagram/instagram.service";

export const dynamic = "force-dynamic";

export async function GET(req) {
    try {
        await dbConnect();

        const url = new URL(req.url);
        const query = (url.searchParams.get("q") || "").toLowerCase().trim();
        const limit = Number(url.searchParams.get("limit") || 50);

        // Fetch active Instagram account
        const account = await InstagramAccount.findOne({ isActive: true }).sort({ updatedAt: -1 });

        if (!account || !account.accessToken) {
            return NextResponse.json({
                success: false,
                isConnected: false,
                message: "No Instagram account connected. Please connect Instagram to view media posts.",
                posts: [],
            });
        }

        const isExpired = account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date();
        if (isExpired) {
            return NextResponse.json({
                success: false,
                isConnected: true,
                isExpired: true,
                username: account.username,
                message: "Instagram access token has expired. Please reconnect.",
                posts: [],
            });
        }

        const rawPosts = await instagramService.getUserMedia(account.accessToken, limit);

        // Map and normalize posts into standard format
        let mappedPosts = rawPosts.map((post) => {
            const imgUrl = post.media_type === "VIDEO" ? (post.thumbnail_url || post.media_url) : post.media_url;
            return {
                id: post.id,
                _id: post.id,
                title: post.caption || "Instagram Post",
                caption: post.caption || "",
                media_type: post.media_type, // 'IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'
                media_url: post.media_url,
                thumbnail_url: post.thumbnail_url || post.media_url,
                imageUrl: imgUrl,
                image_url: imgUrl,
                permalink: post.permalink,
                timestamp: post.timestamp,
                username: post.username || account.username,
            };
        });

        // If search query is provided, filter posts by caption keywords
        if (query) {
            const queryWords = query.split(/\s+/).filter(Boolean);
            mappedPosts = mappedPosts.filter((post) => {
                const captionLower = (post.caption || "").toLowerCase();
                return queryWords.some((word) => captionLower.includes(word));
            });
        }

        return NextResponse.json({
            success: true,
            isConnected: true,
            isExpired: false,
            username: account.username,
            connectedAt: account.connectedAt,
            total: mappedPosts.length,
            posts: mappedPosts,
            data: mappedPosts,
        });
    } catch (error) {
        console.error("[Instagram Posts API Error]:", error);
        return NextResponse.json(
            {
                success: false,
                isConnected: true,
                message: error.message || "Failed to fetch Instagram posts",
                posts: [],
            },
            { status: 500 }
        );
    }
}
