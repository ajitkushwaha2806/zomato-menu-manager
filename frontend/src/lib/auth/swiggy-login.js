import axios from "axios";
import { getAccessToken, setAccessToken, getLoginPromise, setLoginPromise, clearLoginPromise } from "./swiggy-client";

export async function loginSwiggy(accountName) {
    const existingToken = getAccessToken();

    if (existingToken) {
        return existingToken;
    }

    const existingPromise = getLoginPromise();

    if (existingPromise) {
        return existingPromise;
    }

    const promise = (async () => {
        try {
            const response = await axios.post(
                `${process.env.NEXT_PUBLIC_BASE_URL}/api/accounts/swiggy/login`,
                { accountName }
            );
            const token = response.data?.data?.access_token;

            console.log("token", token)

            if (!token) {
                throw new Error("Failed to obtain access token");
            }

            setAccessToken(token);

            return token;
        } finally {
            clearLoginPromise();
        }
    })();

    setLoginPromise(promise);

    return promise;
}