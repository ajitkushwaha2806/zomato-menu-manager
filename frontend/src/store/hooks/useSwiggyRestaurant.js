import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/axios";
import CookieStorage from "@/services/cookie";

export const SWIGGY_RESTAURANT_QUERY_KEY = ["swiggy-restaurant"];

export default function useSwiggyRestaurant() {
    const query = useQuery({
        queryKey: SWIGGY_RESTAURANT_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get("/api/accounts/swiggy/restaurants");
            return data;
        },
        enabled: typeof window !== "undefined" && !!CookieStorage.getSwiggyAccount(),
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
