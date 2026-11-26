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
import { fetchImagesWithCache, getCachedResult, prefetchDishOnHover } from "@/services/imageSearchCacheService";
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
    const activeAbortRef = useRef(null);
    const searchSourceRef = useRef(searchSource);
    const effectiveResIdsRef = useRef("");

    useEffect(() => {
        searchSourceRef.current = searchSource;
    }, [searchSource]);

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

    useEffect(() => {
        effectiveResIdsRef.current = effectiveResIds;
    }, [effectiveResIds]);

    const fetchImages = useCallback(async (query, pageNum = 1, source = searchSource, resIds = effectiveResIds) => {
        if (!query || !query.trim()) {
            setImages([]);
            setHasMore(false);
            return;
        }

        if (activeAbortRef.current) {
            activeAbortRef.current.abort();
        }
        const abortController = new AbortController();
        activeAbortRef.current = abortController;

        const options = source === "outlet"
            ? { urgent: true, resIds, signal: abortController.signal }
            : { urgent: true, signal: abortController.signal };

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
            if (abortController.signal.aborted) return;
            const fetchedData = res.data || [];

            if (pageNum === 1) {
                setImages(fetchedData);
            } else {
                setImages((prev) => {
                    const existingIds = new Set(prev.map((img) => img._id || img.id || img.image_url || img.thumb_url));
                    const newImages = fetchedData.filter(
                        (img) => !existingIds.has(img._id || img.id || img.image_url || img.thumb_url),
                    );
                    return [...prev, ...newImages];
                });
            }
            setHasMore(res.hasMore || false);
            setPage(pageNum);
        } catch (error) {
            if (error?.name === "CanceledError" || error?.name === "AbortError") return;
            console.error("Failed to search images:", error);
        } finally {
            if (!abortController.signal.aborted) {
                setLoading(false);
                setIsLoadingMore(false);
            }
        }
    }, [searchSource, effectiveResIds]);

    const prefetchOtherTabs = useCallback((dishName, currentSource, resIds) => {
        if (!dishName || dishName.trim().length < 2) return;
        const allSources = ["dataset", "foodsnap", "swiggy", "outlet"];
        allSources.forEach((src) => {
            if (src === currentSource) return;
            const opts = src === "outlet" ? { resIds } : {};
            prefetchDishOnHover(dishName, src, opts);
        });
    }, []);

    useEffect(() => {
        if (!isImageSidebarOpen) {
            prevItemKeyRef.current = null;
            return;
        }
        if (activeImageSearchItem?.name) {
            const currentKey = `${activeImageSearchItem.id || ""}-${activeImageSearchItem.name || ""}`;
            if (prevItemKeyRef.current === currentKey) return;
            prevItemKeyRef.current = currentKey;

            const dishName = activeImageSearchItem.name;
            const activeSrc = searchSourceRef.current;
            const resIds = effectiveResIdsRef.current;
            setSearchQuery(dishName);

            const options = activeSrc === "outlet" ? { resIds } : {};
            const cached = getCachedResult(dishName, 1, activeSrc, options);
            if (cached) {
                setImages(cached.data);
                setHasMore(cached.hasMore);
                setPage(1);
                setLoading(false);
                prefetchOtherTabs(dishName, activeSrc, resIds);
            } else {
                fetchImages(dishName, 1, activeSrc, resIds).then(() => {
                    prefetchOtherTabs(dishName, activeSrc, resIds);
                });
            }
        }
    }, [isImageSidebarOpen, activeImageSearchItem, fetchImages, prefetchOtherTabs]);

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

        // Debounced search for manual user typing (180ms for instant feel)
        if (query.trim().length > 1) {
            searchDebounceRef.current = setTimeout(() => {
                fetchImages(query, 1, searchSource, effectiveResIds);
            }, 180);
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
        const fullImageUrl = imageDoc.image_url || imageDoc.url || imageDoc.optimised_image_url || imageDoc.thumb_url;
        if (!activeImageSearchItem || !fullImageUrl) return;
        const imgId = imageDoc._id || imageDoc.id || fullImageUrl;

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
            fileOrUrl: fullImageUrl,
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
                        onMouseEnter={() => prefetchDishOnHover(searchQuery, "dataset")}
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
                        onMouseEnter={() => prefetchDishOnHover(searchQuery, "foodsnap")}
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
                        onMouseEnter={() => prefetchDishOnHover(searchQuery, "swiggy")}
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
                        onMouseEnter={() => prefetchDishOnHover(searchQuery, "outlet", { resIds: effectiveResIds })}
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && searchQuery.trim().length > 1) {
                                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                                fetchImages(searchQuery, 1, searchSource, effectiveResIds);
                            }
                        }}
                        placeholder={
                            searchSource === "outlet"
                                ? "Search dish in your logged-in outlets..."
                                : searchSource === "foodsnap"
                                ? "Search Foodsnap Plus or paste URL..."
                                : searchSource === "swiggy"
                                ? "Search Swiggy Images or paste URL..."
                                : "Search Foodsnap dataset..."
                        }
                        className="pl-9 pr-8 bg-white border-border/50 rounded-xl"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery("");
                                setImages([]);
                                setHasMore(false);
                            }}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Results Grid */}
            <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
                {loading ? (
                    <div className="pb-6">
                        <div className="grid grid-cols-4 gap-3">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="rounded-xl overflow-hidden border border-border/40 bg-white">
                                    <div className="aspect-square w-full bg-slate-100 animate-pulse" />
                                    <div className="p-2 space-y-1">
                                        <div className="h-2.5 bg-slate-100 rounded w-3/4 animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>
                                {searchSource === "outlet"
                                    ? "Searching your logged-in outlets..."
                                    : searchSource === "foodsnap"
                                    ? "Searching Foodsnap Plus..."
                                    : searchSource === "swiggy"
                                    ? "Searching Swiggy images..."
                                    : "Searching Foodsnap dataset..."}
                            </span>
                        </div>
                    </div>
                ) : images.length > 0 ? (
                    <div className="pb-6">
                        <div className="grid grid-cols-4 gap-3">
                            {images.map((img, index) => {
                                const imgKey = img._id || img.id || img.image_url || img.thumb_url;
                                return (
                                    <ImageResultCard
                                        key={imgKey}
                                        img={img}
                                        index={index}
                                        uploadStatus={uploadStatuses[imgKey]}
                                        onSelect={handleSelectImage}
                                    />
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

function ImageResultCard({ img, index, uploadStatus, onSelect }) {
    const candidates = useMemo(() => {
        const list = [
            img.thumb_url,
            img.thumbUrl,
            img.fallback_thumb_url,
            img.optimised_image_url,
            img.image_url,
            img.url,
        ].filter((u) => typeof u === "string" && u.trim().length > 0);
        return Array.from(new Set(list));
    }, [img]);

    const [srcIndex, setSrcIndex] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [allFailed, setAllFailed] = useState(false);
    const imgRef = useRef(null);

    const currentSrc = candidates[srcIndex] || "";

    useEffect(() => {
        setSrcIndex(0);
        setAllFailed(false);
        setLoaded(false);
    }, [candidates]);

    useEffect(() => {
        if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
            setLoaded(true);
        }
    }, [currentSrc]);

    const isUploadingThis = uploadStatus === "uploading";
    const isApprovedThis = uploadStatus === "approved";
    const isRejectedThis = uploadStatus === "rejected";

    const handleImgError = () => {
        if (srcIndex + 1 < candidates.length) {
            setSrcIndex((prev) => prev + 1);
            setLoaded(false);
        } else {
            setAllFailed(true);
            setLoaded(true);
        }
    };

    return (
        <div
            onClick={() => {
                if (!isUploadingThis && !allFailed) onSelect(img);
            }}
            className={cn(
                "group relative rounded-xl overflow-hidden border cursor-pointer bg-white transition-all hover:shadow-md",
                isRejectedThis
                    ? "border-red-500 ring-2 ring-red-500/70 shadow-md shadow-red-100"
                    : "border-border/50 hover:border-primary/40",
                isUploadingThis && "opacity-70 pointer-events-none ring-2 ring-primary"
            )}
        >
            <div className="aspect-square w-full bg-slate-100 relative overflow-hidden">
                {!loaded && !allFailed && (
                    <div className="absolute inset-0 bg-slate-200/70 animate-pulse" />
                )}

                {allFailed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-2 text-center">
                        <XCircle className="h-5 w-5 mb-1 opacity-60" />
                        <span className="text-[10px]">Unavailable</span>
                    </div>
                ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        ref={imgRef}
                        src={currentSrc}
                        alt={img.title || img.name || "Food item"}
                        onLoad={() => setLoaded(true)}
                        onError={handleImgError}
                        className={cn(
                            "w-full h-full object-cover group-hover:scale-105 transition-all duration-300",
                            loaded ? "opacity-100" : "opacity-0"
                        )}
                        loading={index < 12 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index < 8 ? "high" : "auto"}
                    />
                )}

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
                                onSelect(img);
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
}
