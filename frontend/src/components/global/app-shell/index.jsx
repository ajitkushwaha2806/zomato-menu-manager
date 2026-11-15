"use client";
import { store } from "@/store";
import { Provider } from "react-redux";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import AuthProvider from "@/lib/auth/app-provider";
import AppPasswordGate from "@/components/global/auth/AppPasswordGate";
import { SiteHeader } from "@/components/site-header";
import { AppSidebar } from "@/components/app-sidebar";
import NotificationBanner from "../notification/NotificationBanner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const AppShell = ({ children }) => {
  const pathname = usePathname();
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 1000 * 60 * 5,
      }, mutations: { retry: 0, },
    },
  }));


  if (pathname === "/login") {
    return (
      <Provider store={store}>
        <AppPasswordGate>
          <main className="min-h-screen w-full bg-background overflow-hidden" >
            {children}
          </main >
        </AppPasswordGate>
      </Provider>
    );
  }

  const isHiddenSidebar =
    typeof window !== "undefined" &&
    window.location.search.includes("hideSidebar=true");

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AppPasswordGate>
          <AuthProvider>
            <SidebarProvider
              style={{
                "--sidebar-width": "calc(var(--spacing) * 72)",
                "--header-height": "calc(var(--spacing) * 12)",
              }}
            >
              <div className="flex min-h-screen w-full">
                {!isHiddenSidebar && <AppSidebar variant="inset" />}

                <SidebarInset className="flex flex-1 flex-col min-w-0">
                  <React.Suspense fallback={null}>
                    <SiteHeader />
                  </React.Suspense>
                  <NotificationBanner />
                  <main className="flex-1 min-w-0">{children}</main>
                </SidebarInset>
              </div>
            </SidebarProvider>
          </AuthProvider>
        </AppPasswordGate>
      </QueryClientProvider>
    </Provider>
  );
};

export default AppShell;
