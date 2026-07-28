"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Loader2, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Search, Save, RefreshCw, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { uploadPlatformImage } from "@/services/imageService";
import { useMenu } from "@/store/hooks/useMenu";
import { useSelector } from "react-redux";
import api from "@/lib/api/axios";
import axios from "axios";

const cleanQuery = (name) => {
    if (!name) return "";
    let cleaned = name;
    // Remove typical size/portion descriptors
    cleaned = cleaned.replace(/-\s*\[.*?\]/g, ''); // - [4 pcs]
    cleaned = cleaned.replace(/-\s*\(.*?\)/g, ''); // - (4 pcs)
    cleaned = cleaned.replace(/\[.*?\]/g, ''); // [4 pcs]
    cleaned = cleaned.replace(/\(.*?\)/g, ''); // (4 pcs)
    cleaned = cleaned.replace(/\b([0-9]+\s*(pcs|inch|pieces|piece|ml|gm|kg|plate|plates))\b/gi, '');
    cleaned = cleaned.replace(/\bserves\s*[0-9]+\b/gi, '');
    cleaned = cleaned.replace(/\b(half|full|regular|large|small|medium|size)\b/gi, '');
    // Cleanup extra spaces and special chars
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s]/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
};

export default function QuickReviewModal({ 
    isOpen, 
    onClose, 
    items, 
    currentIndex, 
    onNavigate, // function(newIndex)
    activeResId,
    updateItem
}) {
    const [images, setImages] = useState([]);
    const [datasetImagesList, setDatasetImagesList] = useState([]);
    const [swiggyImagesList, setSwiggyImagesList] = useState([]);
    const { activePlatform } = useSelector((state) => state.menu);
    const [page, setPage] = useState(1);
    const [hasMoreDataset, setHasMoreDataset] = useState(true);
    const [hasMoreSwiggy, setHasMoreSwiggy] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [focusedImageIndex, setFocusedImageIndex] = useState(0);
    const [uploadStatus, setUploadStatus] = useState(null);
    const [processingId, setProcessingId] = useState(null);
    const [customQuery, setCustomQuery] = useState("");
    const gridRef = useRef(null);
    const [isTriggering, setIsTriggering] = useState(false);
    const { saveMenuByResId, syncZomatoMenu, isSyncing, isSaving } = useMenu();

    const handleSave = async () => {
        try {
            await saveMenuByResId();
            toast.success("Menu saved locally!");
        } catch (error) {
            toast.error("Failed to save menu");
        }
    };

    const handleSync = async () => {
        if (!activeResId) return;
        try {
            await syncZomatoMenu(activeResId);
            toast.success("Menu synced with Zomato successfully!");
        } catch (error) {
            toast.error("Failed to sync menu");
        }
    };

    const handleTriggerMenu = async () => {
        if (!activeResId) {
            toast.error("Restaurant ID is missing");
            return;
        }
        try {
            setIsTriggering(true);
            await api.post(`/api/menu/${activeResId}/zomato/update-menu`, {});
            toast.success("Menu saved to Zomato successfully!");
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.message || error.message || "Failed to trigger menu");
        } finally {
            setIsTriggering(false);
        }
    };

    const currentItem = items?.[currentIndex];

    // Number of columns in our grid
    const COLUMNS = 6;

    const buildInterleavedGrid = (dataset, swiggy) => {
        const dedupe = (arr) => {
            const map = new Map();
            arr.forEach(img => {
                const url = img.image_url || img.image || img.url;
                if (url && !map.has(url)) map.set(url, img);
            });
            return Array.from(map.values());
        };

        const uniqueDataset = dedupe(dataset);
        const uniqueSwiggy = dedupe(swiggy);

        let interleaved = [];
        let dIndex = 0;
        let sIndex = 0;

        while (dIndex < uniqueDataset.length || sIndex < uniqueSwiggy.length) {
            let row = [];
            for (let i = 0; i < 4; i++) {
                if (dIndex < uniqueDataset.length) row.push(uniqueDataset[dIndex++]);
            }
            let swiggyNeeded = 6 - row.length;
            for (let i = 0; i < swiggyNeeded; i++) {
                if (sIndex < uniqueSwiggy.length) row.push(uniqueSwiggy[sIndex++]);
            }
            let datasetNeeded = 6 - row.length;
            for (let i = 0; i < datasetNeeded; i++) {
                if (dIndex < uniqueDataset.length) row.push(uniqueDataset[dIndex++]);
            }
            interleaved.push(...row);
        }

        return interleaved;
    };

    const fetchCombinedImages = async (query) => {
        if (!query) return;
        setLoading(true);
        setPage(1);
        setDatasetImagesList([]);
        setSwiggyImagesList([]);
        setImages([]);
        setFocusedImageIndex(0);
        setHasMoreDataset(false);
        setHasMoreSwiggy(false);

        try {
            const [datasetRes, swiggyRes] = await Promise.allSettled([
                axios.get(`/api/image/search?q=${encodeURIComponent(query)}&limit=30&page=1`),
                axios.get(`/api/image/swiggy-search?q=${encodeURIComponent(query)}&page=1`)
            ]);

            let newDataset = [];
            let newSwiggy = [];

            if (datasetRes.status === "fulfilled" && datasetRes.value.data?.success) {
                newDataset = (datasetRes.value.data.data || []).map(img => ({ ...img, _source: 'dataset' }));
                setHasMoreDataset(datasetRes.value.data.hasMore);
            }

            if (swiggyRes.status === "fulfilled" && swiggyRes.value.data?.success) {
                newSwiggy = (swiggyRes.value.data.data || []).map(img => ({ ...img, _source: 'swiggy' }));
                setHasMoreSwiggy(swiggyRes.value.data.hasMore);
            }

            setDatasetImagesList(newDataset);
            setSwiggyImagesList(newSwiggy);

            const finalImages = buildInterleavedGrid(newDataset, newSwiggy);
            setImages(finalImages);
        } catch (error) {
            console.error("Error fetching combined images:", error);
            toast.error("Failed to load images for review.");
        } finally {
            setLoading(false);
        }
    };

    const loadMoreImages = async () => {
        if (isLoadingMore || (!hasMoreDataset && !hasMoreSwiggy) || !customQuery) return;
        
        setIsLoadingMore(true);
        const nextPage = page + 1;
        setPage(nextPage);

        try {
            const [datasetRes, swiggyRes] = await Promise.allSettled([
                hasMoreDataset ? axios.get(`/api/image/search?q=${encodeURIComponent(customQuery)}&limit=30&page=${nextPage}`) : Promise.resolve(null),
                hasMoreSwiggy ? axios.get(`/api/image/swiggy-search?q=${encodeURIComponent(customQuery)}&page=${nextPage}`) : Promise.resolve(null)
            ]);

            let newDataset = [...datasetImagesList];
            let newSwiggy = [...swiggyImagesList];

            if (datasetRes?.status === "fulfilled" && datasetRes.value?.data?.success) {
                const data = (datasetRes.value.data.data || []).map(img => ({ ...img, _source: 'dataset' }));
                newDataset = [...newDataset, ...data];
                setHasMoreDataset(datasetRes.value.data.hasMore);
            }

            if (swiggyRes?.status === "fulfilled" && swiggyRes.value?.data?.success) {
                const data = (swiggyRes.value.data.data || []).map(img => ({ ...img, _source: 'swiggy' }));
                newSwiggy = [...newSwiggy, ...data];
                setHasMoreSwiggy(swiggyRes.value.data.hasMore);
            }

            setDatasetImagesList(newDataset);
            setSwiggyImagesList(newSwiggy);

            const finalImages = buildInterleavedGrid(newDataset, newSwiggy);
            setImages(finalImages);
        } catch (error) {
            console.error("Error fetching more images:", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    // Trigger load more when keyboard navigating close to bottom
    useEffect(() => {
        if (images.length > 0 && focusedImageIndex > images.length - 12 && !isLoadingMore && (hasMoreDataset || hasMoreSwiggy)) {
            loadMoreImages();
        }
    }, [focusedImageIndex, images.length, isLoadingMore, hasMoreDataset, hasMoreSwiggy]);

    useEffect(() => {
        if (isOpen && currentItem?.name) {
            const cleaned = cleanQuery(currentItem.name);
            setCustomQuery(cleaned);
            fetchCombinedImages(cleaned);
        }
    }, [isOpen, currentItem?.name]);

    // Handle Keyboard Navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            if (document.activeElement?.tagName === "INPUT") {
                if (e.key === "Enter") {
                    e.preventDefault();
                    fetchCombinedImages(customQuery);
                    document.activeElement.blur();
                }
                return;
            }

            // Prevent default scrolling for arrows
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) {
                e.preventDefault();
            }

            if (e.key === "Escape") {
                onClose();
                return;
            }

            if (e.key === " ") {
                if (currentIndex < items.length - 1) {
                    onNavigate(currentIndex + 1);
                } else {
                    onClose();
                    toast.success("Review complete!");
                }
                return;
            }

            if (images.length === 0) {
                if (e.key === "Enter") {
                    // Skip if no images
                    if (currentIndex < items.length - 1) {
                        onNavigate(currentIndex + 1);
                    } else {
                        onClose();
                        toast.success("Review complete!");
                    }
                }
                return;
            }

            const getNextValidIndex = (startIndex, step) => {
                let idx = startIndex + step;
                while(idx >= 0 && idx < images.length) {
                    if (images[idx]) return idx;
                    idx += step;
                }
                return startIndex;
            };

            switch (e.key) {
                case "ArrowRight":
                    setFocusedImageIndex(prev => getNextValidIndex(prev, 1));
                    break;
                case "ArrowLeft":
                    setFocusedImageIndex(prev => getNextValidIndex(prev, -1));
                    break;
                case "ArrowDown":
                    setFocusedImageIndex(prev => getNextValidIndex(prev, COLUMNS));
                    break;
                case "ArrowUp":
                    setFocusedImageIndex(prev => getNextValidIndex(prev, -COLUMNS));
                    break;
                case "Enter":
                    if (images[focusedImageIndex]) {
                        handleApplyImage(images[focusedImageIndex]);
                    }
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, images, focusedImageIndex, uploadStatus, currentIndex, items]);

    // Auto-scroll the focused item into view
    const prevFocusedIndex = useRef(focusedImageIndex);
    useEffect(() => {
        if (gridRef.current && images.length > 0) {
            if (prevFocusedIndex.current !== focusedImageIndex) {
                const focusedElement = gridRef.current.children[focusedImageIndex];
                if (focusedElement) {
                    focusedElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
                prevFocusedIndex.current = focusedImageIndex;
            }
        }
    }, [focusedImageIndex, images.length]);

    const handleApplyImage = (imageDoc) => {
        if (!currentItem || !imageDoc) return;

        const imageUrl = imageDoc.image_url || imageDoc.image || imageDoc.url;
        if (!imageUrl) return;

        const itemIdToUpdate = currentItem.id;
        const itemName = currentItem.name;
        const tempId = `temp-auto-${crypto.randomUUID()}`;

        // Optimistic update
        updateItem({
            itemId: itemIdToUpdate,
            updates: { 
                media: [{
                    tempReferenceId: tempId,
                    url: imageUrl,
                    isUploading: true,
                    uploadText: 'Applying...'
                }]
            }
        });

        // Move to next item immediately
        if (currentIndex < items.length - 1) {
            onNavigate(currentIndex + 1);
        } else {
            onClose();
            toast.success("Review complete!");
        }

        // Background upload
        if (activePlatform === "swiggy") {
            updateItem({
                itemId: itemIdToUpdate,
                updates: { 
                    media: [{
                        tempReferenceId: tempId,
                        url: imageUrl,
                        thumbUrl: imageUrl,
                        isNewlyUploaded: true,
                        isUploading: false,
                    }] 
                }
            });
            toast.success(`Image applied for ${itemName}!`);
        } else {
            uploadPlatformImage(activePlatform, activeResId, imageUrl, itemName)
                .then(result => {
                    if (result.success) {
                        updateItem({
                            itemId: itemIdToUpdate,
                            updates: { media: result.mediaArray }
                        });
                        toast.success(`Image applied for ${itemName}!`);
                    } else {
                        updateItem({
                            itemId: itemIdToUpdate,
                            updates: { media: [] }
                        });
                        toast.error(`Failed to upload for ${itemName}: ${result.message}`);
                    }
                })
                .catch(err => {
                    console.error("Apply image background error:", err);
                    updateItem({
                        itemId: itemIdToUpdate,
                        updates: { media: [] }
                    });
                    toast.error(`Upload failed for ${itemName}`);
                });
        }
    };

    if (!isOpen || !currentItem) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden relative">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border/60 bg-slate-50/50">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md shrink-0">
                                {currentIndex + 1} / {items.length}
                            </span>
                            <div className="flex items-center gap-2 group">
                                <div className="relative flex items-center">
                                    <Input 
                                        value={customQuery}
                                        onChange={(e) => setCustomQuery(e.target.value)}
                                        className="h-auto px-1 py-0 border-transparent hover:border-border focus-visible:border-primary bg-transparent text-2xl font-bold tracking-tight text-neutral-900 focus-visible:ring-0 shadow-none rounded-sm min-w-[400px] transition-colors"
                                        placeholder="Search query..."
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground opacity-0 group-focus-within:opacity-100 transition-opacity">
                                    ← Edit & press Enter to search
                                </span>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Use <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">↑</kbd>
                            <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">↓</kbd>
                            <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">←</kbd>
                            <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">→</kbd> to navigate,
                            <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">Enter</kbd> to apply, and
                            <kbd className="px-1.5 py-0.5 bg-white border rounded shadow-sm text-xs mx-1">Space</kbd> to skip.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Zomato Actions */}
                        <div className="flex items-center gap-1.5 bg-neutral-100 rounded-md p-1 mr-2">
                            <Button variant="ghost" size="sm" onClick={handleSave} disabled={isSaving} className="h-7 px-2 text-xs">
                                {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleSync} disabled={isSyncing} className="h-7 px-2 text-xs">
                                {isSyncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Sync
                            </Button>
                            <Button variant="default" size="sm" onClick={handleTriggerMenu} disabled={isTriggering} className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700 text-white">
                                {isTriggering ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <UploadCloud className="w-3 h-3 mr-1" />} Trigger
                            </Button>
                        </div>
                        
                        <div className="w-px h-6 bg-border mx-1"></div>

                        <Button variant="outline" size="sm" onClick={() => onNavigate(Math.max(0, currentIndex - 1))} disabled={currentIndex === 0}>
                            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onNavigate(Math.min(items.length - 1, currentIndex + 1))} disabled={currentIndex === items.length - 1}>
                            Next <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                        <div className="w-px h-6 bg-border mx-1"></div>
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-black/5">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </div>

                {/* Grid Layout Container */}
                <div 
                    className="bg-slate-50/50 flex-1 overflow-y-auto p-5"
                    onScroll={(e) => {
                        const { scrollTop, scrollHeight, clientHeight } = e.target;
                        if (scrollHeight - scrollTop - clientHeight < 200) {
                            loadMoreImages();
                        }
                    }}
                >
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="font-medium animate-pulse">Finding best matches for {currentItem.name}...</p>
                        </div>
                    ) : images.length > 0 ? (
                        <div 
                            ref={gridRef}
                            className="grid grid-cols-6 gap-4"
                        >
                            {images.map((img, idx) => {
                                if (!img) {
                                    return <div key={`empty-${idx}`} className="w-full aspect-square opacity-0 pointer-events-none" />;
                                }

                                const isFocused = idx === focusedImageIndex;
                                const imgId = img._id || img.id || img.image_url;
                                const isProcessingThis = processingId === imgId;
                                
                                return (
                                    <div
                                        key={imgId + idx}
                                        onClick={() => {
                                            setFocusedImageIndex(idx);
                                            handleApplyImage(img);
                                        }}
                                        className={cn(
                                            "group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 bg-white",
                                            isFocused ? "ring-4 ring-primary shadow-xl scale-[1.02] z-10" : "border border-border/60 hover:border-primary/50 hover:shadow-md",
                                            uploadStatus === 'uploading' && !isProcessingThis && "opacity-50 pointer-events-none"
                                        )}
                                    >
                                        <div className="aspect-square w-full bg-slate-100 relative">
                                            <img
                                                src={img.image_url || img.image || img.url}
                                                alt={img.title}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                            
                                            {/* Source Badge */}
                                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white shadow-sm"
                                                style={{ backgroundColor: img._source === 'swiggy' ? '#fc8019' : '#e23744' }}>
                                                {img._source}
                                            </div>

                                            {/* Status Overlays */}
                                        </div>
                                        <div className={cn(
                                            "p-3",
                                            isFocused ? "bg-primary/5" : ""
                                        )}>
                                            <p className="text-sm font-semibold truncate text-neutral-900" title={img.title}>
                                                {img.title}
                                            </p>
                                            <div className="flex justify-between items-center mt-1">
                                                {img.category && (
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[90%]">
                                                        {img.category}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-border/50">
                                <Search className="w-8 h-8 text-muted-foreground/50" />
                            </div>
                            <h3 className="text-lg font-semibold text-neutral-800">No matching images found</h3>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                We couldn't find any images for <b>"{currentItem.name}"</b> in our database or Swiggy.
                            </p>
                            <Button 
                                className="mt-6"
                                onClick={() => {
                                    if (currentIndex < items.length - 1) onNavigate(currentIndex + 1);
                                    else onClose();
                                }}
                            >
                                Skip & Next Item <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    )}
                    
                    {isLoadingMore && (
                        <div className="flex justify-center mt-6 mb-2">
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </div>
                    )}
                </div>

                {/* Footer Navigation Hints */}
                <div className="px-5 py-3 border-t border-border/60 bg-white flex justify-between items-center text-xs text-muted-foreground font-medium">
                    <p>Found {images.length} results</p>
                    <p className="flex gap-4">
                        <span><kbd className="bg-neutral-100 border px-1 py-0.5 rounded font-sans">SPACE</kbd> to skip</span>
                        <span><kbd className="bg-neutral-100 border px-1 py-0.5 rounded font-sans">ESC</kbd> to close</span>
                        <span><kbd className="bg-neutral-100 border px-1 py-0.5 rounded font-sans">ENTER</kbd> to apply</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
