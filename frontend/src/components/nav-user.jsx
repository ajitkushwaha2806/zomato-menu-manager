"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconDotsVertical } from "@tabler/icons-react";
import { LogOut } from "lucide-react";
import useUser from "@/store/hooks/useUser";
import useNotification from "@/store/hooks/useNotification";
import CookieStorage from "@/services/cookie";
import { clearAccessToken, clearLoginPromise } from "@/lib/auth/swiggy-client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";

export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { user, isLoading, isError, error } = useUser();
  const notify = useNotification();

  const handled = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isError || handled.current) return;
    handled.current = true;
    CookieStorage.clear();
    clearAccessToken();
    clearLoginPromise();
    notify.error(
      error?.message || "Zomato session expired. Please login again.",
      {
        duration: 5000,
      }
    );

    const timer = setTimeout(() => {
      router.replace("/login");
    }, 5000);

    return () => clearTimeout(timer);
  }, [isError, error, notify, router]);

  const handleLogout = () => {
    CookieStorage.clear();
    clearAccessToken();
    clearLoginPromise();
    queryClient.removeQueries({
      queryKey: ["user"],
    });
    notify.success("Logged out successfully.", {
      duration: 3000,
    });

    const timer = setTimeout(() => {
      router.replace("/login");
    }, 5000);
    return () => clearTimeout(timer);
  };

  const name = user?.userName ?? "Guest";
  const email = user?.userEmail ?? "";
  const avatar = user?.userProfilePicture ?? "";

  const initials = name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              disabled={isLoading}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {isLoading ? "Loading..." : name}
                </span>

                <span className="text-muted-foreground truncate text-xs">
                  {email}
                </span>
              </div>

              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
            className="w-72 overflow-hidden rounded-xl p-0"
          >
            <div className="flex items-center gap-3 border-b p-4">
              <Avatar className="h-11 w-11">
                <AvatarImage src={avatar} alt={name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{name}</p>

                <p className="text-muted-foreground truncate text-xs">
                  {email}
                </p>

                {user?.userMobile && (
                  <p className="text-muted-foreground truncate text-xs">
                    {user.userMobile}
                  </p>
                )}
              </div>
            </div>

            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer py-3 text-red-600 focus:bg-red-500/10 focus:text-red-600"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}