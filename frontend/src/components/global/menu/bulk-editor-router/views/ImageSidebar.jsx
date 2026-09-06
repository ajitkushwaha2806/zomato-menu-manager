"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname, useSearchParams } from "next/navigation";
import { X, Search, Loader2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
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
import axios from "axios";
import { uploadPlatformImage } from "@/services/imageService";

export default function ImageSidebar() {
    const dispatch = useDispatch();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { isImageSidebarOpen, activeImageSearchItem, activeResId, activePlatform } = useSelector(
        (state) => state.menu,
    );

    const [searchQuery, setSearchQuery] = useState("");
    const [searchSource, setSearchSource] = useState("dataset"); // 'dataset' | 'foodsnap' | 'swiggy'
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadStatuses, setUploadStatuses] = useState({}); // { [imageId]: 'uploading' | 'approved' | 'rejected' }
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const prevItemKeyRef = useRef(null);

    const fetchImages = useCallback(async (query, pageNum = 1, source = searchSource) => {
        if (!query || !query.trim()) {
            setImages([]);
            setHasMore(false);
            return;
        }

        try {
            if (pageNum === 1) {
                setLoading(true);
                setImages([]);
            } else {
                setIsLoadingMore(true);
            }

            let endpoint = `/api/image/search?q=${encodeURIComponent(query)}&page=${pageNum}&limit=48`;

            if (source === "foodsnap") {
                endpoint = `/api/image/foodsnap-search?query=${encodeURIComponent(query)}&page=${pageNum}&limit=48`;
            } else if (source === "swiggy") {
                endpoint = `/api/image/swiggy-search?q=${encodeURIComponent(query)}&page=${pageNum}&limit=48`;
            }

            const res = await axios.get(endpoint);

            if (res.data.success) {
                const fetchedData = res.data.data || [];
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
                setHasMore(res.data.hasMore || false);
                setPage(pageNum);
            }
        } catch (error) {
            console.error("Failed to search images:", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [searchSource]);

    useEffect(() => {
        if (isImageSidebarOpen && activeImageSearchItem?.name) {
            const currentKey = `${activeImageSearchItem.id || ""}-${activeImageSearchItem.name || ""}-${searchSource}`;
            if (prevItemKeyRef.current === currentKey) return;
            prevItemKeyRef.current = currentKey;

            setSearchQuery(activeImageSearchItem.name);
            fetchImages(activeImageSearchItem.name, 1, searchSource);
        }
    }, [isImageSidebarOpen, activeImageSearchItem, searchSource, fetchImages]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);

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

        // Debounce simple version:
        if (query.trim().length > 2) {
            fetchImages(query, 1, searchSource);
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
            fetchImages(searchQuery, page + 1, searchSource);
        }
    };

    const handleSelectImage = async (imageDoc) => {
        if (!activeImageSearchItem || !imageDoc.image_url) return;
        const imgId = imageDoc._id || imageDoc.id || imageDoc.image_url;

        setUploadStatuses((prev) => ({ ...prev, [imgId]: "uploading" }));
        dispatch(setImageUploadStatus({ itemId: activeImageSearchItem.id, status: "uploading" }));

        try {
            let mediaArray = [];
            if (activePlatform !== "swiggy") {
                const uploadRes = await uploadPlatformImage(
                    activePlatform,
                    activeResId,
                    imageDoc.image_url,
                    activeImageSearchItem.name,
                );
                if (!uploadRes.success || !uploadRes.mediaArray) {
                    throw new Error(uploadRes.message || "Failed to verify/upload image to Zomato");
                }
                mediaArray = uploadRes.mediaArray.map((m) => ({
                    ...m,
                    entityId: activeImageSearchItem.originalId || activeImageSearchItem.id,
                }));
            } else {
                mediaArray = [
                    {
                        tempReferenceId: `temp-manual-${crypto.randomUUID()}`,
                        url: imageDoc.image_url,
                        thumbUrl: imageDoc.image_url,
                        mediaType: "PHOTO",
                        mediaId: imageDoc.image_url.split("/").pop() || "image.jpg",
                        order: 1,
                        usageType: "FOODSHOT",
                        entityType: "CATALOGUE",
                        entityId: activeImageSearchItem.originalId || activeImageSearchItem.id,
                        fileDirectory: "",
                        source: "MS_MENU_TOOL",
                        fileName: imageDoc.image_url.split("/").pop() || "image.jpg",
                        usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                        isNewlyUploaded: true,
                        isUploading: false,
                    },
                ];
            }

            setUploadStatuses((prev) => ({ ...prev, [imgId]: "approved" }));
            dispatch(setImageUploadStatus({ itemId: activeImageSearchItem.id, status: "approved" }));

            if (activeImageSearchItem.isTicket) {
                dispatch(
                    setTicketImageUpdate({
                        ticketId: activeImageSearchItem.ticketId,
                        imageUrl: imageDoc.image_url,
                    }),
                );
            } else {
                dispatch(
                    addImage({
                        itemId: activeImageSearchItem.id,
                        media: mediaArray,
                    }),
                );
            }
            toast.success("Image applied successfully!");
            setTimeout(() => {
                setUploadStatuses((prev) => {
                    const newMap = { ...prev };
                    delete newMap[imgId];
                    return newMap;
                });
                dispatch(setImageUploadStatus({ itemId: activeImageSearchItem.id, status: null }));
            }, 500);
        } catch (error) {
            console.error("Image apply error:", error);
            setUploadStatuses((prev) => ({ ...prev, [imgId]: "rejected" }));
            dispatch(setImageUploadStatus({ itemId: activeImageSearchItem.id, status: "rejected" }));
            toast.error(error.message || "Failed to apply image");

            setTimeout(() => {
                setUploadStatuses((prev) => {
                    const newMap = { ...prev };
                    delete newMap[imgId];
                    return newMap;
                });
                dispatch(setImageUploadStatus({ itemId: activeImageSearchItem.id, status: null }));
            }, 3000);
        }
    };

    if (!isImageSidebarOpen) return null;

    return (
        <aside className="fixed right-0 top-0 h-full w-1/2 bg-white/80 backdrop-blur-2xl shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.1)] border-l z-50 flex flex-col animate-in slide-in-from-right-full duration-300">
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
                        Swiggy Images
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={handleSearchChange}
                        placeholder={
                            searchSource === "foodsnap"
                                ? "Search Foodsnap Plus or paste URL..."
                                : searchSource === "swiggy"
                                ? "Search Swiggy Images or paste URL..."
                                : "Search Foodsnap dataset..."
                        }
                        className="pl-9 bg-white border-border/50 rounded-xl"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4" onScroll={handleScroll}>
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                        <p className="text-sm text-muted-foreground">
                            Searching {searchSource === "foodsnap" ? "Foodsnap Plus..." : searchSource === "swiggy" ? "Swiggy images..." : "Foodsnap dataset..."}
                        </p>
                    </div>
                ) : images.length > 0 ? (
                    <div className="pb-6">
                        <div className="grid grid-cols-4 gap-3">
                            {images.map((img) => (
                                <div
                                    key={img._id || img.id || img.image_url}
                                    onClick={() => handleSelectImage(img)}
                                    className={cn(
                                        "group relative rounded-xl overflow-hidden border border-border/50 cursor-pointer bg-white transition-all hover:border-primary/40 hover:shadow-md",
                                        uploadStatuses[img._id || img.id || img.image_url] === "uploading" &&
                                            "opacity-70 pointer-events-none ring-2 ring-primary",
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
                                        {uploadStatuses[img._id || img.id || img.image_url] === "uploading" && (
                                            <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center animate-in fade-in duration-200">
                                                <Loader2 className="animate-spin text-primary mb-2" size={24} />
                                                <span className="text-[10px] font-semibold text-neutral-700 tracking-wide uppercase">
                                                    Validating...
                                                </span>
                                            </div>
                                        )}

                                        {uploadStatuses[img._id || img.id || img.image_url] === "approved" && (
                                            <div className="absolute top-2 right-2 z-20 bg-green-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm animate-in zoom-in duration-300">
                                                <CheckCircle2 size={12} /> Approved
                                            </div>
                                        )}

                                        {uploadStatuses[img._id || img.id || img.image_url] === "rejected" && (
                                            <div className="absolute top-2 right-2 z-20 bg-red-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-md flex items-center gap-1 shadow-sm animate-in zoom-in duration-300">
                                                <XCircle size={12} /> Rejected
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <p className="text-xs font-semibold truncate text-foreground">
                                            {img.title}
                                        </p>
                                        {(img.category || img.cuisine) && (
                                            <p className="text-[10px] text-muted-foreground truncate">
                                                {img.cuisine || img.category}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {isLoadingMore && (
                            <div className="flex justify-center py-6">
                                <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                            <Search className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                        <p className="text-sm font-medium text-foreground">
                            No matches found
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Try modifying your search query above.
                        </p>
                    </div>
                )}
            </div>
        </aside>
    );
}
