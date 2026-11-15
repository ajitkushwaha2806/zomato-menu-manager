"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import CookieStorage from "@/services/cookie";

export default function AuthProvider({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    useEffect(() => {
        const hasAuth = CookieStorage.has();
        if (!hasAuth && pathname !== "/login") {
            router.replace("/login");
        }
        if (hasAuth && pathname === "/login") {
            router.replace("/");
        }
    }, [pathname, router]);

    return children;
}