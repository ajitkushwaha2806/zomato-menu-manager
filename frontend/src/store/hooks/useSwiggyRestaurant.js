import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/axios";

export const SWIGGY_RESTAURANT_QUERY_KEY = ["swiggy-restaurant"];

export default function useSwiggyRestaurant() {
    const query = useQuery({
        queryKey: SWIGGY_RESTAURANT_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get("/api/swiggy-restaurants");
            return data;
        },
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
