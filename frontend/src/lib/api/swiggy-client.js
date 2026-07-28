import axios from "axios";
import { loginSwiggy } from "@/lib/auth/swiggy-login";
import { clearAccessToken, getAccessToken } from "@/lib/auth/swiggy-client";

export async function SwiggyClient({
    req,
    endpoint,
    method = "GET",
    data = null,
    params = null,
    headers = {},
}) {
    const makeRequest = async (token) => {
        return await axios({
            baseURL: process.env.NEXT_PUBLIC_SWIGGY_API,
            url: endpoint,
            method,
            data,
            params,
            headers: {
                ...(token ? { accesstoken: token } : {}),
                ...headers,
            },
        });
    };

    const accountName = req?.headers?.get("x-swiggy-account");

    try {
        let token = getAccessToken();
        
        if (!token) {
            token = await loginSwiggy(accountName);
        }

        const response = await makeRequest(token);
        
        return {
            success: true,
            data: response.data,
            status: response.status,
        };
    } catch (error) {
        if (error?.response?.status === 401) {
            console.log("Swiggy token expired (401), refreshing and retrying...");
            clearAccessToken();

            try {
                const newToken = await loginSwiggy(accountName);
                const retryResponse = await makeRequest(newToken);
                
                return {
                    success: true,
                    data: retryResponse.data,
                    status: retryResponse.status,
                };
            } catch (retryError) {
                console.error("SWIGGY RETRY ERROR:", retryError?.response?.status, retryError?.response?.data);
                if (retryError.response?.data) {
                    retryError.message = JSON.stringify(retryError.response.data);
                }
                throw retryError;
            }
        }

        console.error("SWIGGY ERROR:", error?.response?.status, error?.response?.data);
        
        if (error.response?.data) {
            error.message = typeof error.response.data === 'string' 
                ? error.response.data 
                : JSON.stringify(error.response.data);
        }
        
        throw error;
    }
}