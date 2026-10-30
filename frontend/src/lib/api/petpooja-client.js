import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import PetpoojaAccount from "@/model/petpoojaAccount.js";

const client = axios.create({
    timeout: 30000,
});

export async function petpoojaClient({
    req,
    baseURL = process.env.PETPOOJA_API_BASE_URL || "https://new-menu-be.petpooja.com",
    endpoint,
    method = "GET",
    data,
    params,
    headers = {},
    contentType,
    responseType,
    accountName,
    rawCookie,
}) {
    let cookie = rawCookie || (req?.headers?.get("x-petpooja-cookie") ?? "");

    if (!cookie) {
        try {
            await dbConnect();
            if (accountName) {
                const account = await PetpoojaAccount.findOne({ name: accountName });
                if (account?.cookie) cookie = account.cookie;
            } else {
                const latestAccount = await PetpoojaAccount.findOne().sort({ updatedAt: -1 });
                if (latestAccount?.cookie) cookie = latestAccount.cookie;
            }
        } catch (dbErr) {
            console.warn("Could not query PetpoojaAccount from database:", dbErr?.message);
        }
    }

    if (!cookie) {
        throw new Error("No Petpooja cookie found. Please provide x-petpooja-cookie header or configure a Petpooja account.");
    }

    const finalHeaders = {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        Origin: "https://new-menu-fe.petpooja.com",
        Referer: "https://new-menu-fe.petpooja.com/",
        "sec-ch-ua": '"Google Chrome";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
        ...(cookie && { Cookie: cookie }),
        ...headers,
    };

    if (!(data instanceof FormData) && !headers["content-type"] && !headers["Content-Type"]) {
        finalHeaders["Content-Type"] =
            contentType === "form"
                ? "application/x-www-form-urlencoded"
                : "application/json";
    }

    try {
        const { data: response } = await client.request({
            baseURL,
            url: endpoint,
            method,
            data,
            params,
            headers: finalHeaders,
            ...(responseType && { responseType }),
        });

        return response;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            const resData = err.response?.data;
            const rawError = resData?.errors || resData?.error;
            let detailedError = null;

            if (Array.isArray(rawError)) {
                detailedError = rawError.map(e => typeof e === 'object' ? JSON.stringify(e) : String(e)).join(", ");
            } else if (typeof rawError === "string") {
                detailedError = rawError;
            } else if (rawError && typeof rawError === "object") {
                detailedError = Object.entries(rawError)
                    .map(([field, msg]) => {
                        const val = Array.isArray(msg) ? msg.join(", ") : (typeof msg === 'object' ? JSON.stringify(msg) : String(msg));
                        return `${field}: ${val}`;
                    })
                    .join("; ");
            }

            const errorMsg =
                detailedError ||
                resData?.message ||
                (typeof resData === 'string' ? resData : null) ||
                err.response?.statusText ||
                err.message;

            console.error("Petpooja API Error details:", {
                endpoint,
                method,
                status: err.response?.status,
                message: errorMsg,
                data: typeof resData === "object" ? JSON.stringify(resData, null, 2) : resData,
            });

            const apiError = new Error(`Petpooja API Error (${err.response?.status || 'Unknown'}): ${errorMsg}`);
            apiError.response = err.response;
            apiError.status = err.response?.status;
            apiError.detailedError = detailedError;
            apiError.responseData = resData;
            throw apiError;
        }

        throw err;
    }
}