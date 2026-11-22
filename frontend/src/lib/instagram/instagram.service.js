import axios from "axios";

class InstagramService {
    constructor() {
        this.clientId = process.env.INSTAGRAM_CLIENT_ID;
        this.clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    }

    getClientId() {
        return this.clientId || process.env.INSTAGRAM_CLIENT_ID;
    }

    getClientSecret() {
        return this.clientSecret || process.env.INSTAGRAM_CLIENT_SECRET;
    }

    /**
     * Exchange authorization code for a 60-day long-lived access token
     */
    async exchangeCodeForToken(code, redirectUri) {
        try {
            const clientId = this.getClientId();
            const clientSecret = this.getClientSecret();

            if (!clientId || !clientSecret) {
                throw new Error("INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET is not configured");
            }

            // 1. Exchange authorization code for short-lived token
            const tokenFormData = new URLSearchParams();
            tokenFormData.append("client_id", clientId);
            tokenFormData.append("client_secret", clientSecret);
            tokenFormData.append("grant_type", "authorization_code");
            tokenFormData.append("redirect_uri", redirectUri);
            tokenFormData.append("code", code);

            const shortLivedRes = await axios.post("https://api.instagram.com/oauth/access_token", tokenFormData, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            const shortLivedToken = shortLivedRes.data.access_token;
            const igUserId = shortLivedRes.data.user_id;

            // 2. Exchange short-lived token for 60-day long-lived token
            const longLivedRes = await axios.get("https://graph.instagram.com/access_token", {
                params: {
                    grant_type: "ig_exchange_token",
                    client_secret: clientSecret,
                    access_token: shortLivedToken,
                },
            });

            const longLivedToken = longLivedRes.data.access_token;
            const expiresInSeconds = longLivedRes.data.expires_in;
            const expiryDate = new Date(Date.now() + (expiresInSeconds * 1000));

            // 3. Fetch profile username and user details
            const profileRes = await axios.get("https://graph.instagram.com/me", {
                params: {
                    fields: "id,username",
                    access_token: longLivedToken,
                },
            });

            return {
                userId: String(profileRes.data.id || igUserId),
                accessToken: longLivedToken,
                username: profileRes.data.username || "",
                tokenExpiresAt: expiryDate,
            };
        } catch (error) {
            console.error("[InstagramService] Error exchanging code for token:", error?.response?.data || error.message);
            throw new Error(error?.response?.data?.error_message || error?.response?.data?.error?.message || "Failed to exchange Instagram code for tokens");
        }
    }

    /**
     * Fetch media posts published on the Instagram account
     */
    async getUserMedia(accessToken, limit = 50) {
        try {
            const url = new URL("https://graph.instagram.com/me/media");
            url.searchParams.append("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,username");
            url.searchParams.append("access_token", accessToken);
            url.searchParams.append("limit", String(limit));

            const res = await axios.get(url.toString());
            return res.data?.data || [];
        } catch (error) {
            console.error("[InstagramService] Error fetching user media:", error?.response?.data || error.message);
            throw error;
        }
    }
}

export const instagramService = new InstagramService();

