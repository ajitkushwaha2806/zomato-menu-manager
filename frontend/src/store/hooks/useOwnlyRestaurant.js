import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/axios";
import { API_ENDPOINTS } from "@/services/api-endpoints";
import CookieStorage from "@/services/cookie";

export const OWNLY_RESTAURANT_QUERY_KEY = ["ownly-restaurant"];

export default function useOwnlyRestaurant() {
    const query = useQuery({
        queryKey: OWNLY_RESTAURANT_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get(API_ENDPOINTS.ACCOUNTS.OWNLY_RESTAURANTS);
            return data;
        },
        enabled: typeof window !== "undefined" && !!CookieStorage.getOwnlyCookie(),
        retry: false,
    });

    return {
        restaurants: query.data,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        isError: query.isError,
        error: query.error,
        refetch: query.refetch,
    };
}

