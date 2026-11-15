import { useQuery } from "@tanstack/react-query";
import { AuthService } from "@/services/auth";
import CookieStorage from "@/services/cookie";

export const USER_QUERY_KEY = ["user"];

export default function useUser() {
    const hasZomatoCookie = typeof window !== "undefined" && !!CookieStorage.get();

    const query = useQuery({
        queryKey: USER_QUERY_KEY,
        queryFn: AuthService.getProfile,
        enabled: hasZomatoCookie,
        retry: false,
    });

    const activePlatform = typeof window !== "undefined" ? CookieStorage.getActivePlatform() : null;
    const accountName = typeof window !== "undefined" ? CookieStorage.getAccountName() : null;
    const swiggyAccount = typeof window !== "undefined" ? CookieStorage.getSwiggyAccount() : null;

    let fallbackUser = null;
    if (activePlatform === "ownly" || (!hasZomatoCookie && typeof window !== "undefined" && !!CookieStorage.getOwnlyCookie())) {
        fallbackUser = {
            userName: CookieStorage.getOwnlyAccount() || accountName || "Ownly User",
            userEmail: "Ownly Connected",
            platform: "ownly",
        };
    } else if (activePlatform === "petpooja" || (!hasZomatoCookie && typeof window !== "undefined" && !!CookieStorage.getPetpoojaCookie())) {
        fallbackUser = {
            userName: CookieStorage.getPetpoojaAccount() || accountName || "Petpooja User",
            userEmail: "Petpooja Connected",
            platform: "petpooja",
        };
    } else if (activePlatform === "swiggy" || (!hasZomatoCookie && swiggyAccount)) {
        fallbackUser = {
            userName: CookieStorage.getSwiggyAccount() || accountName || "Swiggy User",
            userEmail: "Swiggy Connected",
            platform: "swiggy",
        };
    }

    const activeIsNonZomato = Boolean(activePlatform && activePlatform !== "zomato");
    const effectiveUser = activeIsNonZomato ? (fallbackUser || query.data) : (query.data || fallbackUser);

    return {
        user: effectiveUser,
        isLoading: (!activeIsNonZomato && hasZomatoCookie) ? query.isLoading : false,
        isFetching: (!activeIsNonZomato && hasZomatoCookie) ? query.isFetching : false,
        isError: (!activeIsNonZomato && hasZomatoCookie) ? query.isError : false,
        error: (!activeIsNonZomato && hasZomatoCookie) ? query.error : null,
        refetch: query.refetch,
    };
}