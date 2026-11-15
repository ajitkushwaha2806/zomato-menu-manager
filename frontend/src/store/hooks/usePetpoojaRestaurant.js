import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/axios";
import { API_ENDPOINTS } from "@/services/api-endpoints";
import CookieStorage from "@/services/cookie";

export const PETPOOJA_RESTAURANT_QUERY_KEY = ["petpooja-restaurant"];

export default function usePetpoojaRestaurant() {
    const query = useQuery({
        queryKey: PETPOOJA_RESTAURANT_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get(API_ENDPOINTS.ACCOUNTS.PETPOOJA_RESTAURANTS);
            return data;
        },
        enabled: typeof window !== "undefined" && !!CookieStorage.getPetpoojaCookie(),
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
