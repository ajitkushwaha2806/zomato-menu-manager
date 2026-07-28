"use client";

import * as React from "react";
import {
  ChevronsUpDown,
  Check,
  Store,
  AlertCircle,
  RefreshCw,
  Search,
  Copy,
} from "lucide-react";

import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import { useMenu } from "@/store/hooks/useMenu";

function ProjectSkeleton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-36 rounded-full" />
            <Skeleton className="h-3 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function RestaurantImage({ restaurant }) {
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted shadow-sm">
      {restaurant?.thumbnail ? (
        <img
          src={restaurant.thumbnail}
          alt={restaurant.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <Store className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

export function ProjectSwitcher() {
  const { isMobile } = useSidebar();

  const {
    restaurants: zomatoRestaurants,
    isLoading: isZomatoLoading,
    isError: isZomatoError,
    error: zomatoError,
    refetch: refetchZomato,
    isFetching: isZomatoFetching,
  } = useRestaurant();

  const {
    restaurants: swiggyRestaurants,
    isLoading: isSwiggyLoading,
    isError: isSwiggyError,
    error: swiggyError,
    refetch: refetchSwiggy,
    isFetching: isSwiggyFetching,
  } = useSwiggyRestaurant();

  const { activeResId, activePlatform, setActiveResId } = useMenu();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState(activePlatform || "zomato");

  React.useEffect(() => {
    if (activePlatform) {
        setActiveTab(activePlatform);
    }
  }, [activePlatform]);
  
  const entities = React.useMemo(() => {
    const zomatoEntities = (zomatoRestaurants?.entities || []).map(r => ({ ...r, platform: 'zomato' }));
    const swiggyEntities = (swiggyRestaurants?.entities || []).map(r => ({ ...r, platform: 'swiggy' }));
    return [...zomatoEntities, ...swiggyEntities];
  }, [zomatoRestaurants, swiggyRestaurants]);

  const isLoading = isZomatoLoading || isSwiggyLoading;
  const isError = isZomatoError; // Primary error
  const error = zomatoError;
  const isFetching = isZomatoFetching || isSwiggyFetching;
  const refetch = () => {
      refetchZomato();
      refetchSwiggy();
  };

  const filteredEntities = React.useMemo(() => {
    const tabFiltered = entities.filter(r => r.platform === activeTab);
    if (!searchQuery.trim()) return tabFiltered;
    return tabFiltered.filter(r => 
      r.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.subzone?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [entities, searchQuery, activeTab]);

  const selected = React.useMemo(() => {
    return entities.find((r) => String(r.id) === String(activeResId) && r.platform === activePlatform) || null;
  }, [entities, activeResId, activePlatform]);

  React.useEffect(() => {
    if (!isLoading && !activeResId && entities.length) {
      const savedResId = typeof window !== 'undefined' ? localStorage.getItem('activeResId') : null;
      const savedPlatform = typeof window !== 'undefined' ? localStorage.getItem('activePlatform') : null;
      let matchedEntity = null;
      if (savedResId) {
        if (savedPlatform) {
            matchedEntity = entities.find(e => String(e.id) === savedResId && e.platform === savedPlatform);
        } else {
            matchedEntity = entities.find(e => String(e.id) === savedResId);
        }
      }
      if (matchedEntity) {
        setActiveResId({ id: matchedEntity.id, platform: matchedEntity.platform });
      } else {
        setActiveResId({ id: entities[0].id, platform: entities[0].platform });
      }
    }
  }, [entities, activeResId, setActiveResId, isLoading]);

  if (isLoading) return <ProjectSkeleton />;

  if (isError) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="space-y-3 rounded-xl border border-destructive/10 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-4 text-destructive shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">Unable to load restaurants</p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-normal">
                  {error?.message || "Something went wrong."}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full bg-background hover:bg-destructive/5 hover:text-destructive hover:border-destructive/20 h-8 text-xs"
              onClick={refetch}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Retry Connection
            </Button>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!entities.length) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="rounded-xl border border-dashed p-5 text-center bg-muted/20">
            <Store className="mx-auto mb-2.5 size-6 text-muted-foreground/70" />
            <p className="text-sm font-medium">No Restaurants Found</p>
            <p className="text-muted-foreground mt-1 text-xs max-w-[200px] mx-auto leading-normal">
              We couldn't find any restaurants associated with this account.
            </p>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => {
            if (!open) setSearchQuery("");
        }}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="
                group
                h-14
                rounded-xl
                border
                bg-background
                shadow-sm
                transition-all duration-200
                hover:border-accent-foreground/10
                hover:bg-accent/50
                data-[state=open]:border-accent-foreground/20
                data-[state=open]:bg-accent
              "
            >
              <RestaurantImage restaurant={selected} />

              <div className="grid min-w-0 flex-1 text-left ml-0.5">
                <span className="truncate text-sm font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                  {selected?.name || "Select Restaurant"}
                  {selected?.platform && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                      selected.platform === 'swiggy' 
                        ? 'bg-orange-500/10 text-orange-600' 
                        : 'bg-red-500/10 text-red-600'
                    }`}>
                      {selected.platform}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="truncate text-xs font-medium text-muted-foreground/80">
                    {selected?.subzone || "No zone selected"}
                  </span>
                  {selected?.id && (
                    <span 
                      className="text-[9px] bg-muted px-1.5 py-0.5 rounded border flex items-center gap-1 hover:bg-muted/80 cursor-pointer text-muted-foreground transition-all hover:text-foreground opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(selected.id);
                        toast.success("Restaurant ID copied to clipboard!");
                      }}
                      title="Copy Restaurant ID"
                    >
                      {selected.id} <Copy className="size-2.5" />
                    </span>
                  )}
                </div>
              </div>

              <ChevronsUpDown className="size-4 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={8}
            className="w-[320px] rounded-xl p-1 shadow-lg"
          >
            <DropdownMenuLabel className="px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Your Restaurants
                  </p>
                  <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
                    {entities.length} connected account{entities.length > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>

            <div className="px-2 pb-2">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mb-2">
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="zomato" className="text-[11px] uppercase tracking-wider">Zomato</TabsTrigger>
                  <TabsTrigger value="swiggy" className="text-[11px] uppercase tracking-wider">Swiggy</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search restaurant or zone..."
                      className="w-full text-xs bg-muted/50 border-none rounded-md pl-7 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      onKeyDown={(e) => e.stopPropagation()}
                  />
              </div>
            </div>

            <DropdownMenuSeparator className="mx-1" />

            <div className="max-h-[340px] overflow-y-auto space-y-0.5">
              {filteredEntities.length > 0 ? filteredEntities.map((restaurant) => {
                const active = activeResId === restaurant.id;

                return (
                  <DropdownMenuItem
                    key={restaurant.id + '-' + restaurant.platform}
                    onClick={() => setActiveResId({ id: restaurant.id, platform: restaurant.platform })}
                    className={`
                      flex items-center gap-3
                      cursor-pointer
                      rounded-lg
                      px-2.5
                      py-2
                      transition-colors
                      focus:bg-accent
                      group
                      ${active ? "bg-accent text-accent-foreground font-medium" : ""}
                    `}
                  >
                    <RestaurantImage restaurant={restaurant} />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium flex items-center gap-1.5">
                        {restaurant.name}
                        <span className={`px-1 rounded text-[9px] uppercase font-bold tracking-wider shrink-0 ${
                          restaurant.platform === 'swiggy' 
                            ? 'bg-orange-500/10 text-orange-600' 
                            : 'bg-red-500/10 text-red-600'
                        }`}>
                          {restaurant.platform}
                        </span>
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="truncate text-xs text-muted-foreground/80 font-normal">
                          {restaurant.subzone}
                        </p>
                        {restaurant.id && (
                          <span 
                            className="text-[9px] bg-muted px-1.5 py-0.5 rounded border flex items-center gap-1 hover:bg-muted/80 cursor-pointer text-muted-foreground transition-all hover:text-foreground opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(restaurant.id);
                              toast.success("Restaurant ID copied to clipboard!");
                            }}
                            title="Copy Restaurant ID"
                          >
                            {restaurant.id} <Copy className="size-2.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {active && (
                      <Check className="size-4 text-primary shrink-0 mr-1" />
                    )}
                  </DropdownMenuItem>
                );
              }) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No restaurants found matching "{searchQuery}"
                </div>
              )}
            </div>

            <DropdownMenuSeparator className="mx-1" />

            <div className="flex items-center justify-between px-3 py-2 text-[11px] font-medium text-muted-foreground/70 bg-muted/30 rounded-b-lg">
              <span>Select context to switch</span>
              <span>{filteredEntities.length} Total</span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}