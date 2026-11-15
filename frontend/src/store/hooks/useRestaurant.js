import { useQuery } from "@tanstack/react-query";
import { AuthService } from "@/services/auth";
import CookieStorage from "@/services/cookie";

export const RESTAURANT_QUERY_KEY = ["restaurant"];

export default function useRestaurant() {
    const query = useQuery({
        queryKey: RESTAURANT_QUERY_KEY,
        queryFn: AuthService.getAllRestaurant,
        enabled: typeof window !== "undefined" && !!CookieStorage.get(),
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