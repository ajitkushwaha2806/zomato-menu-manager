"use client";

import { useState, useMemo, useEffect } from "react";
import { useMenu } from "@/store/hooks/useMenu";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import useNotification from "@/store/hooks/useNotification";
import api from "@/lib/api/axios";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ChevronsUpDown, Check, Store, Search } from "lucide-react";
import SwiggyLoginPopover from "./SwiggyLoginPopover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export default function TransferMenuEditor() {
    const { activeResId, setActiveResId, menuData } = useMenu();
    const [platform, setPlatform] = useState("zomato");
    const { restaurants: zomatoRes, isLoading: isZomatoLoading } = useRestaurant();
    const { restaurants: swiggyRes, isLoading: isSwiggyLoading, isError: isSwiggyError, error: swiggyError, refetch: refetchSwiggy } = useSwiggyRestaurant();
    const notification = useNotification();
    const [targetResId, setTargetResId] = useState("");
    const [isTransferring, setIsTransferring] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoginPopoverOpen, setIsLoginPopoverOpen] = useState(false);

    useEffect(() => {
        if (platform === "swiggy" && isSwiggyError) {
            if (swiggyError?.response?.status === 401) {
                setIsLoginPopoverOpen(true);
            }
        }
    }, [platform, isSwiggyError, swiggyError]);

    const availableRestaurants = useMemo(() => {
        const entities = platform === "zomato" ? zomatoRes?.entities : swiggyRes?.entities;
        return entities?.filter(r => r.id !== activeResId) || [];
    }, [platform, zomatoRes, swiggyRes, activeResId]);
    
    const isRestaurantsLoading = platform === "zomato" ? isZomatoLoading : isSwiggyLoading;

    const filteredRestaurants = useMemo(() => {
        if (!searchQuery.trim()) return availableRestaurants;
        return availableRestaurants.filter(r => 
          r.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          r.subzone?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [availableRestaurants, searchQuery]);

    const selectedTarget = useMemo(() => {
        return availableRestaurants.find((r) => r.id === targetResId) || null;
    }, [availableRestaurants, targetResId]);

    const handleTransfer = async () => {
        if (!targetResId) {
            notification.error("Please select a target restaurant");
            return;
        }

        try {
            setIsTransferring(true);
            const endpoint = platform === "zomato"
                ? `/api/menu/${activeResId}/zomato/transfer`
                : `/api/menu/${activeResId}/swiggy/transfer`;

            const payload = platform === "zomato" 
                ? { res_id_to: targetResId }
                : { res_id_to: targetResId, sourceMenu: menuData };

            const response = await api.post(endpoint, payload);

            if (response.data) {
                notification.success("Menu transferred successfully!");
                setActiveResId({ id: targetResId, platform: platform });
            }
        } catch (error) {
            console.error("Transfer error:", error);
            notification.error(error?.response?.data?.message || error.message || "Failed to transfer menu");
        } finally {
            setIsTransferring(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 h-full bg-slate-50 overflow-hidden relative">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Transfer Menu</h2>
                        <p className="text-muted-foreground mt-2">
                            Copy this entire menu to another restaurant. All IDs will be regenerated to avoid conflicts.
                        </p>
                    </div>

                    <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none">
                                Select Platform
                            </label>
                            <div className="flex space-x-4">
                                <Button
                                    variant={platform === "zomato" ? "default" : "outline"}
                                    onClick={() => { setPlatform("zomato"); setTargetResId(""); setSearchQuery(""); }}
                                    className="w-1/2"
                                >
                                    Zomato
                                </Button>
                                <Button
                                    variant={platform === "swiggy" ? "default" : "outline"}
                                    onClick={() => { setPlatform("swiggy"); setTargetResId(""); setSearchQuery(""); }}
                                    className="w-1/2"
                                >
                                    Swiggy
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Target Restaurant
                            </label>
                            
                            <DropdownMenu onOpenChange={(open) => {
                                if (!open) setSearchQuery("");
                            }}>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        disabled={isRestaurantsLoading || isTransferring}
                                        className="
                                            group flex items-center w-full
                                            h-14 px-3 py-2
                                            rounded-xl
                                            border
                                            bg-background
                                            shadow-sm
                                            transition-all duration-200
                                            hover:border-accent-foreground/10
                                            hover:bg-accent/50
                                            data-[state=open]:border-accent-foreground/20
                                            data-[state=open]:bg-accent
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                        "
                                    >
                                        <RestaurantImage restaurant={selectedTarget} />
                                        
                                        <div className="grid min-w-0 flex-1 text-left ml-3">
                                            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
                                                {selectedTarget?.name || (isRestaurantsLoading ? "Loading..." : "Select Restaurant")}
                                            </span>
                                            <span className="truncate text-xs font-medium text-muted-foreground/80">
                                                {selectedTarget?.subzone || "No zone selected"}
                                            </span>
                                        </div>

                                        <ChevronsUpDown className="size-4 shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180 ml-2" />
                                    </button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent
                                    align="start"
                                    sideOffset={8}
                                    className="w-[320px] rounded-xl p-1 shadow-lg"
                                >
                                    <DropdownMenuLabel className="px-3 py-2.5">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                                                    Target Options
                                                </p>
                                                <p className="text-[11px] text-muted-foreground font-normal mt-0.5">
                                                    {availableRestaurants.length} available restaurant{availableRestaurants.length > 1 ? "s" : ""}
                                                </p>
                                            </div>
                                        </div>
                                    </DropdownMenuLabel>

                                    <div className="px-2 pb-2">
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
                                        {filteredRestaurants.length > 0 ? filteredRestaurants.map((restaurant) => {
                                            const active = targetResId === restaurant.id;
                                            return (
                                                <DropdownMenuItem
                                                    key={restaurant.id}
                                                    onClick={() => setTargetResId(restaurant.id)}
                                                    className={`
                                                        flex items-center gap-3
                                                        cursor-pointer
                                                        rounded-lg
                                                        px-2.5
                                                        py-2
                                                        transition-colors
                                                        focus:bg-accent
                                                        ${active ? "bg-accent text-accent-foreground font-medium" : ""}
                                                    `}
                                                >
                                                    <RestaurantImage restaurant={restaurant} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {restaurant.name}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground/80 font-normal">
                                                            {restaurant.subzone}
                                                        </p>
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
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        <Button
                            onClick={handleTransfer}
                            disabled={!targetResId || isTransferring}
                            className="w-full h-12 text-sm mt-4"
                        >
                            {isTransferring ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Transferring...
                                </>
                            ) : (
                                <>
                                    <Send className="mr-2 h-4 w-4" />
                                    Transfer Menu
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            <SwiggyLoginPopover
                isOpen={isLoginPopoverOpen}
                onClose={() => setIsLoginPopoverOpen(false)}
                onSuccess={() => refetchSwiggy()}
            />
        </div>
    );
}
