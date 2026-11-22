"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname, useSearchParams } from "next/navigation";
import { X, Search, Loader2, CheckCircle2, XCircle, Sparkles, RotateCw, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    closeImageSidebar,
    addImage,
    setImageUploadStatus,
    setTicketImageUpdate,
} from "@/store/slice/menuSlice";
import { toast } from "sonner";
import { uploadPlatformImage } from "@/services/imageService";
import { queueImageUpload } from "@/services/imageQueueService";
import { fetchImagesWithCache, getCachedResult } from "@/services/imageSearchCacheService";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import useOwnlyRestaurant from "@/store/hooks/useOwnlyRestaurant";
import usePetpoojaRestaurant from "@/store/hooks/usePetpoojaRestaurant";

export default function ImageSidebar() {
    const dispatch = useDispatch();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isImageSidebarOpen, activeImageSearchItem, activeResId, activePlatform } = useSelector(
        (state) => state.menu,
    );

    const { restaurants: zomatoRestaurants } = useRestaurant();
    const { restaurants: swiggyRestaurants } = useSwiggyRestaurant();
    const { restaurants: ownlyRestaurants } = useOwnlyRestaurant();
    const { restaurants: petpoojaRestaurants } = usePetpoojaRestaurant();

    const [searchQuery, setSearchQuery] = useState("");
    const [searchSource, setSearchSource] = useState("dataset"); // 'dataset' | 'foodsnap' | 'swiggy' | 'outlet'
    const [selectedOutletId, setSelectedOutletId] = useState("all");
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadStatuses, setUploadStatuses] = useState({}); // { [imageId]: 'uploading' | 'approved' | 'rejected' }
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const prevItemKeyRef = useRef(null);
    const searchDebounceRef = useRef(null);

    // Extract all currently logged-in outlets across connected platforms
    const loggedInOutlets = useMemo(() => {
        const list = [];
        const seen = new Set();

        const addFrom = (items, platform) => {
            const arr = Array.isArray(items) ? items : (Array.isArray(items?.entities) ? items.entities : (Array.isArray(items?.data) ? items.data : []));
            arr.forEach((r) => {
                const id = String(r.id || r._id || r.res_id || r.rest_id || "").trim();
                if (id && !seen.has(id)) {
                    seen.add(id);
                    list.push({
                        id,
                        name: r.name || r.rest_name || r.restaurant_name || `Outlet ${id}`,
                        subzone: r.subzone || r.area_name || r.city || "",
                        platform: r.platform || platform,
                    });
                }
            });
        };

        addFrom(zomatoRestaurants, "zomato");
        addFrom(swiggyRestaurants, "swiggy");
        addFrom(ownlyRestaurants, "ownly");
        addFrom(petpoojaRestaurants, "petpooja");

        if (activeResId && !seen.has(String(activeResId).trim())) {
            list.unshift({
                id: String(activeResId).trim(),
                name: "Current Outlet",
                platform: activePlatform || "auto"
            });
        }

        return list;
    }, [zomatoRestaurants, swiggyRestaurants, ownlyRestaurants, petpoojaRestaurants, activeResId, activePlatform]);

    // Comma-separated resIds for querying the database
    const effectiveResIds = useMemo(() => {
        if (selectedOutletId && selectedOutletId !== "all") {
            return selectedOutletId;
        }
        return loggedInOutlets.map((o) => o.id).join(",");
    }, [selectedOutletId, loggedInOutlets]);

    const fetchImages = useCallback(async (query, pageNum = 1, source = searchSource, resIds = effectiveResIds) => {
        if (!query || !query.trim()) {
            setImages([]);
            setHasMore(false);
            return;
        }

        const options = source === "outlet" ? { urgent: true, resIds } : { urgent: true };

        // For page 1, check cache first for instantaneous 0ms display
        if (pageNum === 1) {
            const cached = getCachedResult(query, 1, source, options);
            if (cached) {
                setImages(cached.data);
                setHasMore(cached.hasMore);
                setPage(1);
                setLoading(false);
                return;
            }
            setLoading(true);
            setImages([]);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const res = await fetchImagesWithCache(query, pageNum, source, options);
            const fetchedData = res.data || [];

            if (pageNum === 1) {
                setImages(fetchedData);
            } else {
                setImages((prev) => {
                    const existingIds = new Set(prev.map((img) => img._id || img.id || img.image_url));
                    const newImages = fetchedData.filter(
                        (img) => !existingIds.has(img._id || img.id || img.image_url),
                    );
                    return [...prev, ...newImages];
                });
            }
            setHasMore(res.hasMore || false);
            setPage(pageNum);
        } catch (error) {
            console.error("Failed to search images:", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [searchSource, effectiveResIds]);

    useEffect(() => {
        if (isImageSidebarOpen && activeImageSearchItem?.name) {
            const currentKey = `${activeImageSearchItem.id || ""}-${activeImageSearchItem.name || ""}-${searchSource}-${selectedOutletId}`;
            if (prevItemKeyRef.current === currentKey) return;
            prevItemKeyRef.current = currentKey;

            const dishName = activeImageSearchItem.name;
            setSearchQuery(dishName);

            const options = searchSource === "outlet" ? { resIds: effectiveResIds } : {};
            const cached = getCachedResult(dishName, 1, searchSource, options);
            if (cached) {
                setImages(cached.data);
                setHasMore(cached.hasMore);
                setPage(1);
                setLoading(false);
            } else {
                fetchImages(dishName, 1, searchSource, effectiveResIds);
            }
        }
    }, [isImageSidebarOpen, activeImageSearchItem, searchSource, selectedOutletId, effectiveResIds, fetchImages]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (searchDebounceRef.current) {
            clearTimeout(searchDebounceRef.current);
        }

        // Instant preview for pasted URLs
        if (query.trim().startsWith("http://") || query.trim().startsWith("https://")) {
            setImages([
                {
                    _id: "pasted_url",
                    title: "Pasted Image URL",
                    image_url: query.trim(),
                    category: "Manual URL",
                },
            ]);
            setHasMore(false);
            return;
        }

        // Debounced search for manual user typing
        if (query.trim().length > 1) {
            searchDebounceRef.current = setTimeout(() => {
                fetchImages(query, 1, searchSource, effectiveResIds);
            }, 300);
        }
    };

    const handleScroll = (e) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (
            scrollHeight - scrollTop <= clientHeight * 1.5 &&
            hasMore &&
            !loading &&
            !isLoadingMore
        ) {
            fetchImages(searchQuery, page + 1, searchSource, effectiveResIds);
        }
    };

    const handleSelectImage = (imageDoc) => {
        if (!activeImageSearchItem || !imageDoc.image_url) return;
        const imgId = imageDoc._id || imageDoc.id || imageDoc.image_url;

        // Flash approved checkmark on the sidebar thumbnail immediately
        setUploadStatuses((prev) => ({ ...prev, [imgId]: "approved" }));
        setTimeout(() => {
            setUploadStatuses((prev) => {
                const newMap = { ...prev };
                delete newMap[imgId];
                return newMap;
            });
        }, 1500);

        // Queue upload in background without blocking the UI
        queueImageUpload({
            itemId: activeImageSearchItem.originalId || activeImageSearchItem.id,
            itemName: activeImageSearchItem.name,
            fileOrUrl: imageDoc.image_url,
            isTicket: Boolean(activeImageSearchItem.isTicket),
            ticketId: activeImageSearchItem.ticketId,
            activePlatform,
            activeResId,
            onError: () => {
                setUploadStatuses((prev) => ({ ...prev, [imgId]: "rejected" }));
            },
        });

        toast.success(`Queued "${activeImageSearchItem.name}" for upload!`, { duration: 2500 });
    };

    if (!isImageSidebarOpen) return null;

    return (
        <aside className="fixed right-0 top-0 h-full w-full sm:w-[480px] lg:w-1/2 bg-white/95 backdrop-blur-2xl shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.1)] border-l z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border/50 bg-white/50">
                <div>
                    <h3 className="font-bold text-lg tracking-tight">
                        Image Suggestions
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        For{" "}
                        <span className="font-semibold text-primary">
                            {activeImageSearchItem?.name}
                        </span>
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => dispatch(closeImageSidebar())}
                    className="rounded-full hover:bg-black/5"
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>

            {/* Source Switcher & Search Bar */}
            <div className="p-4 border-b border-border/50 bg-slate-50/50 flex flex-col gap-3">
                <div className="flex bg-slate-200/50 p-1 rounded-lg w-full">
                    <button
                        onClick={() => {
                            setSearchSource("dataset");
                            fetchImages(searchQuery, 1, "dataset");
                        }}
                        className={cn(
                            "flex-1 text-xs font-semibold py-1.5 rounded-md transition-all",
                            searchSource === "dataset"
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        Foodsnap
                    </button>
                    <button
                        onClick={() => {
                            setSearchSource("foodsnap");
                            fetchImages(searchQuery, 1, "foodsnap");
                        }}
                        className={cn(
                            "flex-1 text-xs font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5",
                            searchSource === "foodsnap"
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Sparkles size={12} className="text-primary" />
                        Foodsnap Plus
                    </button>
                    <button
                        onClick={() => {
                            setSearchSource("swiggy");
                            fetchImages(searchQuery, 1, "swiggy");
                        }}
                        className={cn(
                            "flex-1 text-xs font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5",
                            searchSource === "swiggy"
                                ? "bg-white shadow-sm text-primary"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Search size={12} />
                        Swiggy
                    </button>
                    <button
                        onClick={() => {
                            setSearchSource("outlet");
                            fetchImages(searchQuery, 1, "outlet", effectiveResIds);
                        }}
                        className={cn(
                            "flex-1 text-xs font-semibold py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5",
                            searchSource === "outlet"
                                ? "bg-white shadow-sm text-emerald-700 font-bold"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <Store size={12} className={searchSource === "outlet" ? "text-emerald-700" : ""} />
                        My Outlets
                    </button>
                </div>

                {/* Logged-in Outlets Selector Bar */}
                {searchSource === "outlet" && loggedInOutlets.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-none">
                        <span className="text-[10px] font-semibold text-neutral-500 shrink-0">Outlet:</span>
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedOutletId("all");
                                const allIds = loggedInOutlets.map((o) => o.id).join(",");
                                fetchImages(searchQuery, 1, "outlet", allIds);
                            }}
                            className={cn(
                                "px-2.5 py-1 text-[11px] font-medium rounded-full shrink-0 border transition-colors",
                                selectedOutletId === "all"
                                    ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                    : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                            )}
                        >
                            All Outlets ({loggedInOutlets.length})
                        </button>
                        {loggedInOutlets.map((outlet) => (
                            <button
                                key={outlet.id}
                                type="button"
                                onClick={() => {
                                    setSelectedOutletId(outlet.id);
                                    fetchImages(searchQuery, 1, "outlet", outlet.id);
                                }}
                                className={cn(
                                    "px-2.5 py-1 text-[11px] font-medium rounded-full shrink-0 border transition-colors max-w-[160px] truncate",
                                    selectedOutletId === outlet.id
                                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                        : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                                )}
                                title={`${outlet.name} (${outlet.platform})`}
                            >
                                {outlet.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder={
                            searchSource === "outlet"
                                ? "Search dish in your logged-in outlets..."
                                : searchSource === "foodsnap"
                                ? "Search Foodsnap Plus or paste URL..."
                                : searchSource === "swiggy"
                                ? "Search Swiggy Images or paste URL..."
                                : "Search Foodsnap dataset..."
                        }
                        className="pl-9 bg-white border-border/50 rounded-xl"
                    />
                </div>
            </div>

            {/* Results Grid */}
            <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                        <p className="text-sm text-muted-foreground">
                            {searchSource === "outlet"
                                ? "Searching your logged-in outlets..."
                                : searchSource === "foodsnap"
                                ? "Searching Foodsnap Plus..."
                                : searchSource === "swiggy"
                                ? "Searching Swiggy images..."
                                : "Searching Foodsnap dataset..."}
                        </p>
                    </div>
                ) : images.length > 0 ? (
                    <div className="pb-6">
                        <div className="grid grid-cols-4 gap-3">
                            {images.map((img) => {
                                const imgKey = img._id || img.id || img.image_url;
                                const isUploadingThis = uploadStatuses[imgKey] === "uploading";
                                const isApprovedThis = uploadStatuses[imgKey] === "approved";
                                const isRejectedThis = uploadStatuses[imgKey] === "rejected";

                                return (
                                    <div
                                        key={imgKey}
                                        onClick={() => {
                                            if (!isUploadingThis) handleSelectImage(img);
                                        }}
                                        className={cn(
                                            "group relative rounded-xl overflow-hidden border cursor-pointer bg-white transition-all hover:shadow-md",
                                            isRejectedThis
                                                ? "border-red-500 ring-2 ring-red-500/70 shadow-md shadow-red-100"
                                                : "border-border/50 hover:border-primary/40",
                                            isUploadingThis && "opacity-70 pointer-events-none ring-2 ring-primary"
                                        )}
                                    >
                                        <div className="aspect-square w-full bg-slate-100 relative">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={img.image_url}
                                                alt={img.title || "Food item"}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                loading="lazy"
                                            />
                                            {/* State Overlays */}
                                            {isUploadingThis && (
                                                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center animate-in fade-in duration-200">
                                                    <Loader2 className="animate-spin text-primary mb-2" size={24} />
                                                    <span className="text-[10px] font-semibold text-neutral-700 tracking-wide uppercase">
                                                        Validating...
                                                    </span>
                                                </div>
                                            )}

                                            {isApprovedThis && (
                                                <div className="absolute top-2 right-2 z-20 bg-green-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm animate-in zoom-in duration-300">
                                                    <CheckCircle2 size={12} /> Approved
                                                </div>
                                            )}

                                            {isRejectedThis && (
                                                <div 
                                                    className="absolute inset-x-0 bottom-0 bg-red-600/95 text-white p-1.5 flex items-center justify-between gap-1 z-20 animate-in slide-in-from-bottom duration-200"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <span className="text-[10px] font-semibold flex items-center gap-1">
                                                        <XCircle size={11} className="shrink-0 text-red-200" /> Failed
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSelectImage(img);
                                                        }}
                                                        className="bg-white hover:bg-neutral-100 active:scale-95 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 transition-all cursor-pointer"
                                                    >
                                                        <RotateCw size={10} className="shrink-0" /> Retry
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2">
                                            <p className="text-xs font-semibold truncate text-foreground">
                                                {img.title || img.name}
                                            </p>
                                            {(img.restaurantName || img.category || img.cuisine) && (
                                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                                    {img.restaurantName ? (
                                                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium truncate inline-block max-w-full">
                                                            {img.restaurantName}
                                                        </span>
                                                    ) : (
                                                        img.cuisine || img.category
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {isLoadingMore && (
                            <div className="flex justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            {searchSource === "outlet" ? (
                                <Store className="h-5 w-5 text-emerald-600" />
                            ) : (
                                <Search className="h-5 w-5 text-muted-foreground/50" />
                            )}
                        </div>
                        <p className="text-sm font-medium text-foreground">
                            {searchSource === "outlet"
                                ? `No matching dish found in your ${selectedOutletId !== "all" ? "selected outlet" : "logged-in outlets"}`
                                : "No matches found"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                            {searchSource === "outlet"
                                ? (loggedInOutlets.length === 0
                                    ? "No logged-in outlets found. Please connect your accounts or import your menu."
                                    : "Try searching with broader dish keywords or select another outlet.")
                                : "Try modifying your search query above."}
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
}
