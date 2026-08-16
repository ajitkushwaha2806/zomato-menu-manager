import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/axios";

export const PETPOOJA_RESTAURANT_QUERY_KEY = ["petpooja-restaurant"];

export default function usePetpoojaRestaurant() {
    const query = useQuery({
        queryKey: PETPOOJA_RESTAURANT_QUERY_KEY,
        queryFn: async () => {
            const { data } = await api.get("/api/accounts/petpooja/restaurants");
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
