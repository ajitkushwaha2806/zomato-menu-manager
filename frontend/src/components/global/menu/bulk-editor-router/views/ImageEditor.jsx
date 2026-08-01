import { useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ImageIcon, Loader2, CheckCircle2, XCircle, Sparkles, Trash2, Play, Database, Search, AlertCircle, Copy } from "lucide-react";
import { openImageSidebar } from "@/store/slice/menuSlice";
import ZomatoImageDropzone from "../../shared/ZomatoImageDropzone";
import useNotification from "@/store/hooks/useNotification";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import api from "@/lib/api/axios";
import { uploadPlatformImage } from "@/services/imageService";

const ImageCard = ({ item, onClick, onDrop, isActive }) => {
    const imgUrl = item?.media?.[0]?.thumbUrl || item?.media?.[0]?.url || item.image_url || (typeof item.image === 'string' ? item.image : item.image?.url);
    const isNewMedia = item?.media?.[0]?.id?.toString().startsWith("temp-") || item?.media?.[0]?.tempReferenceId?.toString().startsWith("temp-") || item?.media?.[0]?.isNewlyUploaded;

    return (
        <ZomatoImageDropzone
            itemId={item?.id}
            itemName={item?.name}
            onClick={() => onClick(item)}
            onUploadSuccess={(mediaArray) => onDrop(item.id, mediaArray)}
            overlayText="Drop Image"
            className={`group relative rounded-xl overflow-hidden border bg-card transition-all duration-200 cursor-pointer select-none
                ${isActive
                    ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                    : isNewMedia
                        ? 'border-yellow-400 ring-2 ring-yellow-400/20 shadow-sm hover:border-yellow-500 hover:-translate-y-[1px]'
                        : 'border-border/60 hover:border-border hover:shadow-md hover:-translate-y-[1px]'
                } 
            `}
        >
            {/* Image Container */}
            <div className="aspect-square w-full bg-muted relative overflow-hidden border-b border-border/40">
                {item?.media?.[0]?.mediaTags?.some?.(t => t.tagSlug === "rejected") ? (
                    <div className="absolute inset-x-0 bottom-0 bg-red-500 text-white text-[10px] font-bold text-center py-1 z-10">
                        REJECTED
                    </div>
                ) : item?.media?.[0]?.onHoldStatus === 2 ? (
                    <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-white text-[10px] font-bold text-center py-1 z-10">
                        ON HOLD
                    </div>
                ) : null}
                
                {imgUrl && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDrop(item.id, []);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-md transition-colors z-30 opacity-0 group-hover:opacity-100"
                        title="Delete Image"
                    >
                        <XCircle size={16} />
                    </button>
                )}

                {imgUrl ? (
                    <img
                        src={imgUrl}
                        alt={item.name}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out`}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 bg-zinc-50/50">
                        <ImageIcon size={20} strokeWidth={1.5} />
                        <span className="text-[10px] font-medium tracking-wide uppercase">No Image</span>
                    </div>
                )}
                {/* Temporary Loading State for Auto Apply */}
                {item?.media?.[0]?.isUploading && (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] z-20">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                        <span className="text-white text-[10px] font-medium px-2 py-1 bg-black/50 rounded-md">
                            {item.media[0].uploadText || 'Applying...'}
                        </span>
                    </div>
                )}
            </div>

            {/* Content Details */}
            <div className="p-2.5 space-y-1 bg-white">
                <div className="flex justify-between items-start gap-1">
                    <p className="text-xs font-semibold truncate text-neutral-800 leading-tight" title={item.name}>
                        {item.name || "Unnamed Item"}
                    </p>
                    {(item.base_price === 0 || item.price === 0) && (
                        <div className="shrink-0 flex items-center justify-center" title="Price is 0">
                            <AlertCircle size={12} className="text-red-500" />
                        </div>
                    )}
                </div>

                {item._parentCategoryName && (
                    <p className="text-[10px] text-muted-foreground font-medium truncate flex items-center gap-1" title={`${item._parentCategoryName} → ${item._parentSubCategoryName}`}>
                        <span className="bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded">
                            {item._parentCategoryName}
                        </span>
                        {item._parentSubCategoryName && (
                            <>
                                <span className="text-neutral-300">/</span>
                                <span className="truncate">{item._parentSubCategoryName}</span>
                            </>
                        )}
                    </p>
                )}
            </div>
        </ZomatoImageDropzone>
    );
};

export default function ImageEditor({ allItems, updateItem }) {
    const dispatch = useDispatch();
    const notification = useNotification();
    const { isImageSidebarOpen, activeItem, activeResId, activePlatform } = useSelector((state) => state.menu);
    const notify = useNotification();

    const [isAutoApplying, setIsAutoApplying] = useState(false);
    const [autoApplyProgress, setAutoApplyProgress] = useState({ total: 0, completed: 0 });
    const [removeConfirm, setRemoveConfirm] = useState(false);
    const removeConfirmTimer = useRef(null);

    const [isCrossResModalOpen, setIsCrossResModalOpen] = useState(false);
    const [targetResId, setTargetResId] = useState("");
    const [targetPlatform, setTargetPlatform] = useState("zomato");

    const handleRemoveAllImages = () => {
        if (!removeConfirm) {
            setRemoveConfirm(true);
            removeConfirmTimer.current = setTimeout(() => setRemoveConfirm(false), 3000);
            return;
        }
        clearTimeout(removeConfirmTimer.current);
        setRemoveConfirm(false);
        allItems.forEach(item => {
            updateItem({ itemId: item.id, updates: { media: [] } });
        });
        notify.success("All images removed.");
    };

    const handleAutoApplyImages = async () => {
        const itemsWithoutMedia = allItems.filter(item => {
            const hasMedia = item.media && item.media.length > 0;
            return !hasMedia;
        });

        if (itemsWithoutMedia.length === 0) {
            notify.success("All items already have images!");
            return;
        }

        // Inject temporary placeholders
        itemsWithoutMedia.forEach(item => {
            updateItem({
                itemId: item.id,
                updates: {
                    media: [{
                        tempReferenceId: `temp-auto-${crypto.randomUUID()}`,
                        url: '',
                        isUploading: true
                    }]
                }
            });
        });

        setIsAutoApplying(true);
        setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: 0 });

        // Maintain a set of used image URLs to prevent duplicates
        const usedImages = new Set();
        allItems.forEach(item => {
            if (item.media && item.media.length > 0) {
                item.media.forEach(m => {
                    if (m.url) usedImages.add(m.url);
                    if (m.thumbUrl) usedImages.add(m.thumbUrl);
                });
            } else if (item.image_url) {
                usedImages.add(item.image_url);
            }
        });

        try {
            const chunkSize = 3;
            let completedCount = 0;
            
            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        // Map is_veg to food_type expected by the match API
                        const foodTypeMap = {
                            VEG: "veg",
                            NON_VEG: "non_veg",
                            EGG: "egg",
                        };
                        const food_type = foodTypeMap[item.is_veg] || "veg";

                        // Hit local search proxy to avoid CORS, passing param premium = true
                        const res = await api.get(`/api/image/search`, {
                            params: {
                                q: item.name,
                                premium: true
                            }
                        });
                        const photos = res.data?.data || [];

                        let finalMedia = [];

                        for (let j = 0; j < Math.min(6, photos.length); j++) {
                            const photo = photos[j];
                            const imageUrl = photo.image_url || photo.image || photo.url;
                            if (!imageUrl) continue;

                            // Prevent duplicate images
                            if (usedImages.has(imageUrl)) continue;

                            // Optimistically mark as used
                            usedImages.add(imageUrl);

                            updateItem({
                                itemId: item.id,
                                updates: {
                                    media: [{
                                        tempReferenceId: `temp-auto-${crypto.randomUUID()}`,
                                        url: '',
                                        isUploading: true,
                                        uploadText: `Trying ${j+1}/${Math.min(6, photos.length)}`
                                    }]
                                }
                            });

                            if (activePlatform !== "swiggy") {
                                // Upload to Zomato to ensure proper tracking and approval
                                const uploadRes = await uploadPlatformImage(activePlatform, activeResId, imageUrl, item.name);
                                if (uploadRes.success && uploadRes.mediaArray) {
                                    finalMedia = uploadRes.mediaArray.map(m => ({
                                        ...m,
                                        entityId: item.originalId || item.id
                                    }));
                                    break;
                                }
                            } else {
                                // Swiggy — use source URL directly
                                finalMedia = [{
                                    tempReferenceId: `temp-auto-${crypto.randomUUID()}`,
                                    url: imageUrl,
                                    thumbUrl: photo.thumb_url || photo.thumbUrl || imageUrl,
                                    mediaType: "PHOTO",
                                    mediaId: imageUrl.split('/').pop() || "image.jpg",
                                    order: 1,
                                    usageType: "FOODSHOT",
                                    entityType: "CATALOGUE",
                                    entityId: item.originalId || item.id,
                                    fileDirectory: "",
                                    source: "MS_MENU_TOOL",
                                    fileName: imageUrl.split('/').pop() || "image.jpg",
                                    usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                                    isNewlyUploaded: true,
                                    isUploading: false,
                                }];
                                break;
                            }

                        }

                        return { itemId: item.id, media: finalMedia };

                    } catch (e) {
                        console.error(`Failed to fetch/upload image for ${item.name}`, e);
                        return { itemId: item.id, media: [] };
                    }
                });
                
                const results = await Promise.all(fetchPromises);
                
                results.forEach(result => {
                    const { itemId, media } = result;
                    if (media && media.length > 0) {
                        updateItem({ itemId, updates: { media } });
                    } else {
                        // No image found — reset to empty so card shows "No Image" cleanly
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                // Rate limit: wait 3 seconds between chunks
                await new Promise(r => setTimeout(r, 2000));
            }
            
            setIsAutoApplying(false);
            notify.success(`Successfully applied images for ${itemsWithoutMedia.length} items!`);
            
        } catch (err) {
            console.error(err);
            notify.error("Failed during auto apply images.");
            setIsAutoApplying(false);
        }
    };

    const handleApplyFromDB = async () => {
        const itemsWithoutMedia = allItems.filter(item => {
            const hasMedia = item.media && item.media.length > 0;
            return !hasMedia;
        });

        if (itemsWithoutMedia.length === 0) {
            notify.success("All items already have images!");
            return;
        }

        // Inject temporary placeholders
        itemsWithoutMedia.forEach(item => {
            updateItem({
                itemId: item.id,
                updates: {
                    media: [{
                        tempReferenceId: `temp-db-${crypto.randomUUID()}`,
                        url: '',
                        isUploading: true,
                        uploadText: 'Searching DB...'
                    }]
                }
            });
        });

        setIsAutoApplying(true);
        setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: 0 });

        // Maintain a set of used image URLs to prevent duplicates
        const usedImages = new Set();
        allItems.forEach(item => {
            if (item.media && item.media.length > 0) {
                item.media.forEach(m => {
                    if (m.url) usedImages.add(m.url);
                    if (m.thumbUrl) usedImages.add(m.thumbUrl);
                });
            } else if (item.image_url) {
                usedImages.add(item.image_url);
            }
        });

        try {
            const chunkSize = 2; // Process 2 images at a time to prevent rate limiting
            let completedCount = 0;
            
            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        const res = await api.get(`/api/image/internal-search`, {
                            params: {
                                q: item.name,
                                limit: 6
                            }
                        });
                        const photos = res.data?.data || [];

                        let finalMedia = [];

                        for (let j = 0; j < Math.min(6, photos.length); j++) {
                            const photo = photos[j];
                            const imageUrl = photo.image_url || photo.image || photo.url;
                            
                            if (!imageUrl) continue;

                            if (usedImages.has(imageUrl)) continue;
                            usedImages.add(imageUrl);

                            updateItem({
                                itemId: item.id,
                                updates: {
                                    media: [{
                                        tempReferenceId: `temp-db-${crypto.randomUUID()}`,
                                        url: '',
                                        isUploading: true,
                                        uploadText: `Uploading from DB ${j+1}/${Math.min(6, photos.length)}...`
                                    }]
                                }
                            });

                            if (activePlatform !== "swiggy") {
                                // Upload to Zomato to ensure proper tracking and approval
                                const uploadRes = await uploadPlatformImage(activePlatform, activeResId, imageUrl, item.name);
                                if (uploadRes.success && uploadRes.mediaArray) {
                                    finalMedia = uploadRes.mediaArray.map(m => ({
                                        ...m,
                                        entityId: item.originalId || item.id
                                    }));
                                    break;
                                }
                            } else {
                                // Swiggy fallback
                                finalMedia = [{
                                    tempReferenceId: `temp-db-${crypto.randomUUID()}`,
                                    url: imageUrl,
                                    thumbUrl: photo.thumb_url || photo.thumbUrl || imageUrl,
                                    mediaType: "PHOTO",
                                    mediaId: photo.mediaId || imageUrl.split('/').pop() || "image.jpg",
                                    order: 1,
                                    usageType: "FOODSHOT",
                                    entityType: "CATALOGUE",
                                    entityId: item.originalId || item.id,
                                    fileDirectory: photo.fileDirectory || "",
                                    source: "MS_MENU_TOOL",
                                    fileName: photo.fileName || imageUrl.split('/').pop() || "image.jpg",
                                    usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                                    isNewlyUploaded: true,
                                    isUploading: false,
                                }];
                            }
                            
                            if (finalMedia.length > 0) break;
                        }

                        return { itemId: item.id, media: finalMedia };

                    } catch (e) {
                        console.error(`Failed to fetch/upload internal image for ${item.name}`, e);
                        return { itemId: item.id, media: [] };
                    }
                });
                
                const results = await Promise.all(fetchPromises);
                
                results.forEach(result => {
                    const { itemId, media } = result;
                    if (media && media.length > 0) {
                        updateItem({ itemId, updates: { media } });
                    } else {
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                // Rate limit: wait 3 seconds between chunks
                await new Promise(r => setTimeout(r, 3000));
            }
            
            setIsAutoApplying(false);
            notify.success(`Successfully applied images from DB for ${itemsWithoutMedia.length} items!`);
            
        } catch (err) {
            console.error(err);
            notify.error("Failed during DB auto apply.");
            setIsAutoApplying(false);
        }
    };

    const handleCrossResApply = async () => {
        if (!targetResId.trim()) {
            notify.error("Please enter a valid Restaurant ID.");
            return;
        }

        const itemsWithoutMedia = allItems.filter(item => {
            const hasMedia = item.media && item.media.length > 0;
            return !hasMedia;
        });

        if (itemsWithoutMedia.length === 0) {
            notify.success("All items already have images!");
            setIsCrossResModalOpen(false);
            return;
        }

        setIsCrossResModalOpen(false);
        setIsAutoApplying(true);
        setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: 0 });

        try {
            // 1. Fetch the target restaurant's menu
            const res = await api.get(`/api/menu/${targetResId.trim()}`, {
                params: { platform: targetPlatform }
            });

            if (!res.data?.success || !res.data?.data?.menu) {
                notify.error("Failed to load target restaurant menu.");
                setIsAutoApplying(false);
                return;
            }

            const targetMenu = res.data.data.menu;

            // 2. Flatten target menu to get a map of lowercase item names to their media arrays
            const targetMediaMap = {};
            targetMenu.forEach(cat => {
                cat.sub_category?.forEach(subcat => {
                    subcat.items?.forEach(item => {
                        const name = item.name?.trim().toLowerCase();
                        if (name && item.media && item.media.length > 0) {
                            targetMediaMap[name] = item.media;
                        } else if (name && item.image_url) {
                            targetMediaMap[name] = [{ url: item.image_url, thumbUrl: item.image_url }];
                        }
                    });
                });
            });

            // 3. Match items and update
            let completedCount = 0;
            const chunkSize = 2; // Process 2 at a time

            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        const nameKey = item.name?.trim().toLowerCase();
                        const sourceMediaArray = targetMediaMap[nameKey];

                        if (!sourceMediaArray || sourceMediaArray.length === 0) {
                            return { itemId: item.id, media: [] };
                        }

                        const sourceImageUrl = sourceMediaArray[0].url || sourceMediaArray[0].thumbUrl || sourceMediaArray[0].image_url;

                        if (!sourceImageUrl) {
                            return { itemId: item.id, media: [] };
                        }

                        // Show temporary uploading state
                        updateItem({
                            itemId: item.id,
                            updates: {
                                media: [{
                                    tempReferenceId: `temp-cross-${crypto.randomUUID()}`,
                                    url: '',
                                    isUploading: true,
                                    uploadText: `Copying from ${targetPlatform}...`
                                }]
                            }
                        });

                        let finalMedia = [];

                        if (activePlatform !== "swiggy") {
                            // Upload to Zomato to ensure proper tracking and approval
                            const uploadRes = await uploadPlatformImage(activePlatform, activeResId, sourceImageUrl, item.name);
                            if (uploadRes.success && uploadRes.mediaArray) {
                                finalMedia = uploadRes.mediaArray.map(m => ({
                                    ...m,
                                    entityId: item.originalId || item.id
                                }));
                            }
                        } else {
                            // Swiggy fallback
                            finalMedia = [{
                                tempReferenceId: `temp-cross-${crypto.randomUUID()}`,
                                url: sourceImageUrl,
                                thumbUrl: sourceMediaArray[0].thumbUrl || sourceImageUrl,
                                mediaType: "PHOTO",
                                mediaId: sourceMediaArray[0].mediaId || sourceImageUrl.split('/').pop() || "image.jpg",
                                order: 1,
                                usageType: "FOODSHOT",
                                entityType: "CATALOGUE",
                                entityId: item.originalId || item.id,
                                fileDirectory: sourceMediaArray[0].fileDirectory || "",
                                source: "MS_MENU_TOOL",
                                fileName: sourceMediaArray[0].fileName || sourceImageUrl.split('/').pop() || "image.jpg",
                                usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                                isNewlyUploaded: true,
                                isUploading: false,
                            }];
                        }

                        return { itemId: item.id, media: finalMedia };
                    } catch (e) {
                        console.error(`Failed to apply cross-res image for ${item.name}`, e);
                        return { itemId: item.id, media: [] };
                    }
                });

                const results = await Promise.all(fetchPromises);
                
                results.forEach(result => {
                    const { itemId, media } = result;
                    if (media && media.length > 0) {
                        updateItem({ itemId, updates: { media } });
                    } else {
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                // Rate limit: wait 3 seconds between chunks
                await new Promise(r => setTimeout(r, 3000));
            }

            setIsAutoApplying(false);
            notify.success(`Successfully applied images from restaurant ${targetResId}!`);

        } catch (err) {
            console.error(err);
            notify.error("An error occurred while copying images.");
            setIsAutoApplying(false);
        }
    };


    if (!allItems || allItems.length === 0) {
        return (
            <div className="flex-1 flex flex-col gap-2 items-center justify-center text-muted-foreground min-h-[300px]">
                <ImageIcon size={32} className="stroke-1 text-muted-foreground/60" />
                <p className="text-sm font-medium">No items available to edit.</p>
            </div>
        );
    }

    const handleDropImage = (itemId, mediaArray) => {
        updateItem({ itemId, updates: { media: mediaArray } });
    };

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative bg-neutral-50/40">
            {/* Main Content Pane */}
            <div className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ease-in-out ${isImageSidebarOpen ? 'w-1/2 pr-4 mr-[50%]' : 'w-full'}`}>
                <div className="mx-auto space-y-6">
                    {/* Header Banner */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-neutral-200/60 pb-4 gap-4 relative">
                        <div>
                            <h2 className="text-xl font-bold tracking-tight text-neutral-900">Image Editor</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Select an item to refine search options or instantly update assets via drag & drop.
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                            <Button
                                variant="secondary"
                                onClick={handleRemoveAllImages}
                                disabled={isAutoApplying}
                                className={`h-9 rounded-lg px-4 border transition-colors ${
                                    removeConfirm
                                        ? 'bg-red-500 hover:bg-red-600 text-white border-red-500'
                                        : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                                }`}
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>{removeConfirm ? 'Confirm Remove?' : 'Remove All'}</span>
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleAutoApplyImages}
                                disabled={isAutoApplying}
                                className="h-9 rounded-lg px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors relative overflow-hidden"
                            >
                                {isAutoApplying ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-indigo-600" />
                                        <span>Applying ({autoApplyProgress.completed}/{autoApplyProgress.total})</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4 text-indigo-500" />
                                        <span>Auto Apply Images</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleApplyFromDB}
                                disabled={isAutoApplying}
                                className="h-9 rounded-lg px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors relative overflow-hidden"
                            >
                                <Database className="mr-2 h-4 w-4 text-emerald-500" />
                                <span>Auto-fill from DB</span>
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setIsCrossResModalOpen(true)}
                                disabled={isAutoApplying}
                                className="h-9 rounded-lg px-4 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors relative overflow-hidden shrink-0"
                            >
                                <Copy className="mr-2 h-4 w-4 text-amber-500" />
                                <span>Copy from Rest.</span>
                            </Button>
                        </div>
                        
                        {/* Progress Bar under the header */}
                        {isAutoApplying && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-indigo-100 overflow-hidden">
                                <div 
                                    className="h-full bg-indigo-600 transition-all duration-300 ease-out" 
                                    style={{ width: `${Math.min(100, (autoApplyProgress.completed / Math.max(1, autoApplyProgress.total)) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>

                    <div className={`grid gap-4 transition-all duration-300 ${isImageSidebarOpen
                            ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
                            : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
                        }`}>
                        {allItems.map(item => (
                            <ImageCard
                                key={item.id}
                                item={item}
                                isActive={activeItem?.id === item.id}
                                onClick={(item) => dispatch(openImageSidebar(item))}
                                onDrop={handleDropImage}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Cross-Restaurant Modal */}
            <Dialog open={isCrossResModalOpen} onOpenChange={setIsCrossResModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Copy Images from Restaurant</DialogTitle>
                        <DialogDescription>
                            Enter the Restaurant ID and platform to fetch images and match them by item name.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="resId">Restaurant ID</Label>
                            <Input
                                id="resId"
                                value={targetResId}
                                onChange={(e) => setTargetResId(e.target.value)}
                                placeholder="e.g. 18464619"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="platform">Platform</Label>
                            <Select value={targetPlatform} onValueChange={setTargetPlatform}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select platform" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="zomato">Zomato</SelectItem>
                                    <SelectItem value="swiggy">Swiggy</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCrossResModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleCrossResApply} className="bg-amber-600 hover:bg-amber-700 text-white">
                            Fetch and Apply
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}