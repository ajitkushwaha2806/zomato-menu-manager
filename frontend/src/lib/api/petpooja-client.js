import axios from "axios";
import dbConnect from "@/lib/dbConnect";
import PetpoojaAccount from "@/model/petpoojaAccount.js";

const client = axios.create({
    timeout: 30000,
});

export async function petpoojaClient({
    req,
    baseURL = process.env.PETPOOJA_API_BASE_URL,
    endpoint,
    method = "GET",
    data,
    params,
    headers = {},
    contentType,
    accountName,
    rawCookie,
}) {
    let cookie = rawCookie || (req?.headers?.get("x-petpooja-cookie") ?? "");

    if (!cookie && accountName) {
        await dbConnect();
        const account = await PetpoojaAccount.findOne({ name: accountName });
        cookie = account?.cookie || "";
    }

    if (!cookie) {
        throw new Error("Either accountName, rawCookie, or x-petpooja-cookie header is mandatory for petpoojaClient");
    }

    const finalHeaders = {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/137 Safari/537.36",
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
        });

        console.log("response", response);

        return response;
    } catch (err) {
        if (axios.isAxiosError(err)) {
            throw new Error(
                err.response?.data?.message ||
                err.response?.statusText ||
                err.message
            );
        }

        throw err;
    }
}