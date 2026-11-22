import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { ImageIcon, Loader2, CheckCircle2, XCircle, Sparkles, Trash2, Play, Database, Search, AlertCircle, Copy, RefreshCw, Cloud } from "lucide-react";
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
import { GoogleOAuthProvider } from "@react-oauth/google";
import GoogleDriveImportModal from "./GoogleDriveImportModal";
import { startMenuImagePrefetch, pausePrefetchQueue, prefetchDishOnHover } from "@/services/imageSearchCacheService";

const ImageCard = ({ item, onClick, onDrop, isActive }) => {
    const [imgLoadFailed, setImgLoadFailed] = useState(false);
    const { imageUploadStatuses, activeResId, activePlatform } = useSelector((state) => state.menu);

    const uploadStatusEntry = item?.id ? imageUploadStatuses?.[item?.id] : null;
    const isUploadRejected = (typeof uploadStatusEntry === "object" ? uploadStatusEntry?.status : uploadStatusEntry) === "rejected";
    const uploadErrorMsg = typeof uploadStatusEntry === "object" ? uploadStatusEntry?.error : null;

    // Pick the best public image URL, prioritizing accessible source or CloudFront over private S3 buckets
    const m = item?.media?.[0];
    const candidateUrls = [
        m?.sourceUrl,
        m?.thumbUrl,
        m?.url,
        item?.image_url,
        typeof item?.image === 'string' ? item.image : item?.image?.url
    ].filter(Boolean);

    const publicUrl = candidateUrls.find(u => typeof u === 'string' && !u.includes("temp-uploads-live.s3"));
    const keyFallback = (m?.key || (typeof m?.url === 'string' && m.url.includes("temp-uploads-live.s3") ? m.url.split('/').pop().replace(/^thumb_/, '') : null));
    const imgUrl = publicUrl || (keyFallback ? `/uploads/petpooja/${keyFallback}` : null);
    const isNewMedia = item?.media?.[0]?.id?.toString().startsWith("temp-") || item?.media?.[0]?.tempReferenceId?.toString().startsWith("temp-") || item?.media?.[0]?.isNewlyUploaded;

    return (
        <ZomatoImageDropzone
            itemId={item?.id}
            itemName={item?.name}
            onClick={() => onClick(item)}
            onMouseEnter={() => prefetchDishOnHover(item?.name, "dataset")}
            onUploadSuccess={(mediaArray) => {
                setImgLoadFailed(false);
                onDrop(item.id, mediaArray);
            }}
            overlayText="Drop Image"
            className={`group relative rounded-xl overflow-hidden border bg-card transition-all duration-200 cursor-pointer select-none
                ${isUploadRejected
                    ? '!border-red-500 !ring-2 !ring-red-500/70 shadow-md shadow-red-100'
                    : isActive
                        ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                        : isNewMedia
                            ? 'border-yellow-400 ring-2 ring-yellow-400/20 shadow-sm hover:border-yellow-500 hover:-translate-y-[1px]'
                            : 'border-border/60 hover:border-border hover:shadow-md hover:-translate-y-[1px]'
                } 
            `}
        >
            {/* Image Container */}
            <div className="aspect-square w-full bg-muted relative overflow-hidden border-b border-border/40">
                {isUploadRejected ? (
                    <div className="absolute inset-x-0 bottom-0 bg-red-600/95 text-white text-[10px] font-semibold px-2 py-1 z-20 flex items-center gap-1 shadow backdrop-blur-xs">
                        <XCircle size={11} className="shrink-0 text-red-200" />
                        <span className="truncate" title={uploadErrorMsg || "Upload failed"}>
                            {uploadErrorMsg || "Upload failed"}
                        </span>
                    </div>
                ) : item?.media?.[0]?.mediaTags?.some?.(t => t.tagSlug === "rejected") ? (
                    <div className="absolute inset-x-0 bottom-0 bg-red-500 text-white text-[10px] font-bold text-center py-1 z-10">
                        REJECTED
                    </div>
                ) : item?.media?.[0]?.onHoldStatus === 2 ? (
                    <div className="absolute inset-x-0 bottom-0 bg-amber-500 text-white text-[10px] font-bold text-center py-1 z-10">
                        ON HOLD
                    </div>
                ) : null}
                
                {imgUrl && !imgLoadFailed && (
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (activePlatform === "petpooja" && item?.id && !String(item.id).startsWith("temp-")) {
                                try {
                                    await api.put(`/api/menu/${activeResId}/petpooja/items/${item.id}`, {
                                        images: { main: null },
                                    });
                                } catch (delErr) {
                                    console.warn("Could not remove image on Petpooja:", delErr?.message);
                                }
                            }
                            onDrop(item.id, []);
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-md transition-colors z-30 opacity-0 group-hover:opacity-100"
                        title="Delete Image"
                    >
                        <XCircle size={16} />
                    </button>
                )}

                {imgUrl && !imgLoadFailed ? (
                    <img
                        src={imgUrl}
                        alt={item.name}
                        className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out`}
                        loading="lazy"
                        onError={(e) => {
                            const fallback = candidateUrls.find(u => u !== imgUrl && !u.includes("temp-uploads-live.s3"));
                            if (fallback && e.currentTarget.src !== fallback) {
                                e.currentTarget.src = fallback;
                            } else if (keyFallback && !e.currentTarget.src.includes(`/uploads/petpooja/${keyFallback}`)) {
                                e.currentTarget.src = `/uploads/petpooja/${keyFallback}`;
                            } else {
                                setImgLoadFailed(true);
                            }
                        }}
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

const cleanTitle = (str) => {
    if (!str || typeof str !== "string") return "";
    return str
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*\[[^\]]*\]/g, "")
        .trim();
};

const normalizeTitle = (str) => {
    if (!str || typeof str !== "string") return "";
    return str
        .toLowerCase()
        .trim()
        .replace(/['"’]/g, "")
        .replace(/[^a-z0-9]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const levenshteinDistance = (s1, s2) => {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
};

const getMatchScore = (itemName, candidateTitle, minThreshold = 0.95) => {
    if (!itemName || !candidateTitle) return 0;
    const s1 = String(itemName).toLowerCase().trim();
    const s2 = String(candidateTitle).toLowerCase().trim();

    // 100% exact match
    if (s1 === s2) return 1.0;

    const norm1 = normalizeTitle(s1);
    const norm2 = normalizeTitle(s2);

    if (norm1 === norm2) return 1.0;

    // Check with portion / size notes in parentheses removed (e.g. "Cold Coffee (300ml)" vs "Cold Coffee")
    const cleanNorm1 = normalizeTitle(cleanTitle(s1));
    const cleanNorm2 = normalizeTitle(cleanTitle(s2));
    if (cleanNorm1 && cleanNorm2 && cleanNorm1 === cleanNorm2) return 0.98;

    // Evaluate edit distance and similarity on full normalized titles
    const maxLen = Math.max(norm1.length, norm2.length);
    let levSim = 0;
    if (maxLen > 0) {
        const distance = levenshteinDistance(norm1, norm2);
        levSim = (maxLen - distance) / maxLen;
    }

    // Also check on cleaned strings (e.g. minor typo with parentheses stripped)
    let cleanLevSim = 0;
    if (cleanNorm1 && cleanNorm2) {
        const cleanMaxLen = Math.max(cleanNorm1.length, cleanNorm2.length);
        if (cleanMaxLen >= 3) {
            const cleanDistance = levenshteinDistance(cleanNorm1, cleanNorm2);
            cleanLevSim = (cleanMaxLen - cleanDistance) / cleanMaxLen;
        }
    }

    // Token / Word Overlap similarity (e.g. "Afghani Chaap (350 Gram)" vs "Afghani Soya Chaap")
    const targetA = cleanNorm1 || norm1;
    const targetB = cleanNorm2 || norm2;
    const wordsA = targetA.split(/\s+/).filter(w => w.length > 1);
    const wordsB = targetB.split(/\s+/).filter(w => w.length > 1);

    let tokenSim = 0;
    let containmentScore = 0;

    if (wordsA.length > 0 && wordsB.length > 0) {
        const setA = new Set(wordsA);
        const setB = new Set(wordsB);
        let intersection = 0;

        for (const w of setA) {
            if (setB.has(w)) {
                intersection++;
            } else {
                // Check for close word match (e.g. "chaap" vs "champ", "paneer" vs "panir")
                for (const wb of setB) {
                    if (Math.abs(w.length - wb.length) <= 1 && w.length >= 4) {
                        if (levenshteinDistance(w, wb) <= 1) {
                            intersection += 0.9;
                            break;
                        }
                    }
                }
            }
        }

        // Sørensen–Dice token similarity
        tokenSim = (2 * intersection) / (wordsA.length + wordsB.length);

        // Containment: if one dish name's words are largely contained in the other
        const minWords = Math.min(wordsA.length, wordsB.length);
        const maxWords = Math.max(wordsA.length, wordsB.length);
        const containmentRatio = intersection / minWords;

        if (containmentRatio >= 0.99 && minWords >= 2) {
            // E.g. "Afghani Chaap" (2 words) in "Afghani Soya Chaap" (3 words): intersection=2, min=2 => 100% contained
            containmentScore = 0.82 + (minWords / maxWords) * 0.15;
        } else if (containmentRatio >= 0.8 && minWords >= 2) {
            containmentScore = 0.75 * containmentRatio;
        }
    }

    const bestScore = Math.max(levSim, cleanLevSim, tokenSim, containmentScore);

    if (bestScore >= minThreshold) {
        return Math.min(1.0, Number(bestScore.toFixed(3)));
    }

    return 0; // Less than allowed threshold
};

export default function ImageEditor({ allItems, updateItem }) {
    const dispatch = useDispatch();
    const notification = useNotification();
    const { isImageSidebarOpen, activeItem, activeResId, activePlatform } = useSelector((state) => state.menu);
    const notify = useNotification();

    const [isAutoApplying, setIsAutoApplying] = useState(false);
    const [autoApplyType, setAutoApplyType] = useState(null); // 'dataset' | 'foodsnap_plus' | 'db' | 'cross_res' | null
    const [autoApplyProgress, setAutoApplyProgress] = useState({ total: 0, completed: 0 });
    const [removeConfirm, setRemoveConfirm] = useState(false);
    const removeConfirmTimer = useRef(null);

    const [isCrossResModalOpen, setIsCrossResModalOpen] = useState(false);
    const [targetResId, setTargetResId] = useState("");
    const [targetPlatform, setTargetPlatform] = useState("zomato");
    const [similarityThreshold, setSimilarityThreshold] = useState(70);

    const [isDriveImportModalOpen, setIsDriveImportModalOpen] = useState(false);
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // Intelligent background prefetching:
    // When the user opens the Image Editor, begin pre-warming image search queries in the background
    // (prioritizing items without photos first), using polite rate limiting (2 concurrent requests, 200ms delay)
    // so tapping any dish opens suggestions instantaneously with zero waiting or lag.
    useEffect(() => {
        if (allItems && allItems.length > 0) {
            startMenuImagePrefetch(allItems, "dataset");
        }
        return () => {
            pausePrefetchQueue();
        };
    }, [allItems]);

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
        setAutoApplyType('dataset');
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
            let appliedCount = 0;
            
            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        const foodTypeMap = {
                            VEG: "veg",
                            NON_VEG: "non_veg",
                            EGG: "egg",
                        };
                        const food_type = foodTypeMap[item.is_veg] || "veg";

                        const query = (item.name || "").toLowerCase().trim();

                        // 1. Search internal DB of synced restaurants (exact authentic Zomato menu dish photos)
                        let photos = [];
                        try {
                            const internalRes = await api.get(`/api/image/internal-search`, {
                                params: {
                                    q: query,
                                    limit: 25
                                }
                            });
                            if (internalRes.data?.data?.length > 0) {
                                photos = internalRes.data.data;
                            }
                        } catch (err) {
                            console.warn("Internal DB search error:", err);
                        }

                        // Rank candidates by match score: strictly require >= 95% similarity
                        let candidatePhotos = photos
                            .map((photo) => {
                                const photoTitle = photo.title || photo.dish_name || photo.name || photo.item_name || photo.dishName || "";
                                if (item.is_veg === "VEG" && (photo.food_type === "non_veg" || photo.is_veg === "NON_VEG" || photo.is_veg === false)) {
                                    return null;
                                }
                                let maxScore = getMatchScore(item.name, photoTitle);
                                if (Array.isArray(photo.allNames)) {
                                    for (const altName of photo.allNames) {
                                        const altScore = getMatchScore(item.name, altName);
                                        if (altScore > maxScore) maxScore = altScore;
                                    }
                                }
                                if (maxScore < 0.95) return null; // strictly >= 95% match
                                return { photo, score: maxScore };
                            })
                            .filter(Boolean)
                            .sort((a, b) => {
                                // If match scores differ noticeably (> 0.04), prioritize the closer match
                                if (Math.abs(b.score - a.score) > 0.04) {
                                    return b.score - a.score;
                                }
                                // For items with similar high match scores, pick the image with the most appearances in DB
                                const countA = a.photo.count || 1;
                                const countB = b.photo.count || 1;
                                if (countB !== countA) {
                                    return countB - countA;
                                }
                                return b.score - a.score;
                            })
                            .map((entry) => entry.photo);

                        // 2. If no high confidence candidate (>=95%) found in DB, check external catalog
                        if (candidatePhotos.length === 0) {
                            try {
                                const res = await api.get(`/api/image/search`, {
                                    params: {
                                        q: query,
                                        limit: 30,
                                        premium: true
                                    }
                                });
                                const extPhotos = res.data?.data || [];
                                candidatePhotos = extPhotos
                                    .map((photo) => {
                                        const photoTitle = photo.title || photo.dish_name || photo.name || photo.item_name || photo.dishName || "";
                                        if (item.is_veg === "VEG" && (photo.food_type === "non_veg" || photo.is_veg === "NON_VEG" || photo.is_veg === false)) {
                                            return null;
                                        }
                                        const score = getMatchScore(item.name, photoTitle);
                                        if (score < 0.95) return null; // strictly >= 95% match
                                        return { photo, score };
                                    })
                                    .filter(Boolean)
                                    .sort((a, b) => b.score - a.score)
                                    .map((entry) => entry.photo);
                            } catch (err) {
                                console.warn("External image search error:", err);
                            }
                        }

                        if (candidatePhotos.length === 0) {
                            return { itemId: item.id, media: [] };
                        }

                        let finalMedia = [];

                        for (let j = 0; j < Math.min(6, candidatePhotos.length); j++) {
                            const photo = candidatePhotos[j];
                            const imageUrl = photo.image_url || photo.image || photo.url;
                            if (!imageUrl) continue;

                            // Prevent duplicate images
                            if (usedImages.has(imageUrl)) continue;
                            usedImages.add(imageUrl);

                            updateItem({
                                itemId: item.id,
                                updates: {
                                    media: [{
                                        tempReferenceId: `temp-auto-${crypto.randomUUID()}`,
                                        url: '',
                                        isUploading: true,
                                        uploadText: photo.count > 1 
                                            ? `Applying popular DB match (${photo.count} uses)...`
                                            : `Uploading best match ${j+1}/${candidatePhotos.length}`
                                    }]
                                }
                            });

                            // Upload image to the respective platform (Zomato or Swiggy)
                            try {
                                const uploadRes = await uploadPlatformImage(activePlatform, activeResId, imageUrl, item.name, item.originalId || item.id);
                                if (uploadRes?.success && uploadRes?.mediaArray?.length > 0) {
                                    finalMedia = uploadRes.mediaArray.map(m => ({
                                        ...m,
                                        entityId: item.originalId || item.id
                                    }));
                                    break;
                                } else {
                                    console.warn(`Platform upload failed for ${item.name}:`, uploadRes?.message);
                                }
                            } catch (e) {
                                console.warn(`Platform upload error for ${item.name}:`, e);
                            }

                            // Direct fallback if platform upload is not supported or failed
                            finalMedia = [{
                                tempReferenceId: `temp-auto-${crypto.randomUUID()}`,
                                url: imageUrl,
                                thumbUrl: photo.thumb_url || photo.thumbUrl || imageUrl,
                                mediaType: "PHOTO",
                                mediaId: photo.mediaId || imageUrl.split('/').pop() || "image.jpg",
                                order: 1,
                                usageType: "FOODSHOT",
                                entityType: "CATALOGUE",
                                entityId: item.originalId || item.id,
                                fileName: photo.fileName || imageUrl.split('/').pop() || "image.jpg",
                                usageTypeEnum: "USAGE_TYPE_FOODSHOT",
                                isNewlyUploaded: true,
                                isUploading: false,
                            }];
                            break;

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
                        appliedCount++;
                        updateItem({ itemId, updates: { media } });
                    } else {
                        // No exact match found — reset to empty so card shows "No Image" cleanly
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                // Rate limit: wait 2 seconds between chunks
                await new Promise(r => setTimeout(r, 2000));
            }
            
            setIsAutoApplying(false);
            setAutoApplyType(null);
            if (appliedCount > 0) {
                notify.success(`Successfully applied 100% matched images for ${appliedCount} items!`);
            } else {
                notify.info("No 100% exact matched images found for the items.");
            }
            
        } catch (err) {
            console.error(err);
            notify.error("Failed during auto apply images.");
            setIsAutoApplying(false);
            setAutoApplyType(null);
        }
    };

    const handleAutoApplyFoodsnapPlus = async () => {
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
                        tempReferenceId: `temp-fsp-${crypto.randomUUID()}`,
                        url: '',
                        isUploading: true,
                        uploadText: 'Searching Foodsnap Plus...'
                    }]
                }
            });
        });

        setIsAutoApplying(true);
        setAutoApplyType('foodsnap_plus');
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
            let appliedCount = 0;
            
            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        const query = (item.name || "").toLowerCase().trim();
                        const res = await api.get(`/api/image/foodsnap-search`, {
                            params: {
                                query: query,
                                limit: 30
                            }
                        });
                        const photos = res.data?.data || [];

                        // Rank candidates by match score: allows up to 2 alphabets difference or >=95% similarity, never less
                        const candidatePhotos = photos
                            .map((photo) => {
                                const photoTitle = photo.title || photo.dish_name || photo.name || photo.item_name || photo.dishName || "";
                                if (item.is_veg === "VEG" && (photo.food_type === "non_veg" || photo.is_veg === "NON_VEG" || photo.is_veg === false)) {
                                    return null;
                                }
                                const score = getMatchScore(item.name, photoTitle);
                                if (score <= 0) return null;
                                return { photo, score };
                            })
                            .filter(Boolean)
                            .sort((a, b) => b.score - a.score)
                            .map((entry) => entry.photo);

                        if (candidatePhotos.length === 0) {
                            return { itemId: item.id, media: [] };
                        }

                        let finalMedia = [];

                        for (let j = 0; j < Math.min(6, candidatePhotos.length); j++) {
                            const photo = candidatePhotos[j];
                            const imageUrl = photo.image_url || photo.image || photo.url;
                            
                            if (!imageUrl) continue;

                            if (usedImages.has(imageUrl)) continue;
                            usedImages.add(imageUrl);

                            updateItem({
                                itemId: item.id,
                                updates: {
                                    media: [{
                                        tempReferenceId: `temp-fsp-${crypto.randomUUID()}`,
                                        url: '',
                                        isUploading: true,
                                        uploadText: `Uploading from Foodsnap+ ${j+1}/${candidatePhotos.length}...`
                                    }]
                                }
                            });

                            if (activePlatform !== "swiggy") {
                                const uploadRes = await uploadPlatformImage(activePlatform, activeResId, imageUrl, item.name, item.originalId || item.id);
                                if (uploadRes.success && uploadRes.mediaArray) {
                                    finalMedia = uploadRes.mediaArray.map(m => ({
                                        ...m,
                                        entityId: item.originalId || item.id
                                    }));
                                    break;
                                }
                            } else {
                                finalMedia = [{
                                    tempReferenceId: `temp-fsp-${crypto.randomUUID()}`,
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
                                break;
                            }
                        }

                        return { itemId: item.id, media: finalMedia };

                    } catch (e) {
                        console.error(`Failed to fetch/upload Foodsnap Plus image for ${item.name}`, e);
                        return { itemId: item.id, media: [] };
                    }
                });
                
                const results = await Promise.all(fetchPromises);
                
                results.forEach(result => {
                    const { itemId, media } = result;
                    if (media && media.length > 0) {
                        appliedCount++;
                        updateItem({ itemId, updates: { media } });
                    } else {
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                await new Promise(r => setTimeout(r, 2000));
            }
            
            setIsAutoApplying(false);
            setAutoApplyType(null);
            if (appliedCount > 0) {
                notify.success(`Successfully applied Foodsnap Plus images for ${appliedCount} items!`);
            } else {
                notify.info("No 100% exact matched images found in Foodsnap Plus.");
            }
            
        } catch (err) {
            console.error(err);
            notify.error("Failed during auto-fill from Foodsnap Plus.");
            setIsAutoApplying(false);
            setAutoApplyType(null);
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
        setAutoApplyType('db');
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
            let appliedCount = 0;
            
            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        const query = (item.name || "").toLowerCase().trim();
                        const res = await api.get(`/api/image/internal-search`, {
                            params: {
                                q: query,
                                limit: 30
                            }
                        });
                        const photos = res.data?.data || [];

                        // Rank candidates by match score: allows up to 2 alphabets difference or >=95% similarity, never less
                        const candidatePhotos = photos
                            .map((photo) => {
                                const photoTitle = photo.title || photo.dish_name || photo.name || photo.item_name || photo.dishName || "";
                                if (item.is_veg === "VEG" && (photo.food_type === "non_veg" || photo.is_veg === "NON_VEG" || photo.is_veg === false)) {
                                    return null;
                                }
                                let maxScore = getMatchScore(item.name, photoTitle);
                                if (Array.isArray(photo.allNames)) {
                                    for (const altName of photo.allNames) {
                                        const altScore = getMatchScore(item.name, altName);
                                        if (altScore > maxScore) maxScore = altScore;
                                    }
                                }
                                if (maxScore < 0.95) return null; // strictly >= 95% match
                                return { photo, score: maxScore };
                            })
                            .filter(Boolean)
                            .sort((a, b) => {
                                // If match scores differ noticeably (> 0.04), prioritize the closer match
                                if (Math.abs(b.score - a.score) > 0.04) {
                                    return b.score - a.score;
                                }
                                // For items with similar high match scores, pick the image with the most appearances in DB
                                const countA = a.photo.count || 1;
                                const countB = b.photo.count || 1;
                                if (countB !== countA) {
                                    return countB - countA;
                                }
                                return b.score - a.score;
                            })
                            .map((entry) => entry.photo);

                        if (candidatePhotos.length === 0) {
                            return { itemId: item.id, media: [] };
                        }

                        let finalMedia = [];

                        for (let j = 0; j < Math.min(6, candidatePhotos.length); j++) {
                            const photo = candidatePhotos[j];
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
                                        uploadText: photo.count > 1 
                                            ? `Applying popular DB match (${photo.count} uses)...`
                                            : `Uploading from DB ${j+1}/${candidatePhotos.length}...`
                                    }]
                                }
                            });

                            // Upload to respective platform (Zomato or Swiggy)
                            try {
                                const uploadRes = await uploadPlatformImage(activePlatform, activeResId, imageUrl, item.name, item.originalId || item.id);
                                if (uploadRes?.success && uploadRes?.mediaArray?.length > 0) {
                                    finalMedia = uploadRes.mediaArray.map(m => ({
                                        ...m,
                                        entityId: item.originalId || item.id
                                    }));
                                    break;
                                }
                            } catch (e) {
                                console.warn("Platform upload fallback to direct URL:", e);
                            }

                            // Fallback: directly apply CDN URL from DB so image is never lost
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
                            break;
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
                        appliedCount++;
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
            setAutoApplyType(null);
            if (appliedCount > 0) {
                notify.success(`Successfully applied images from DB for ${appliedCount} items!`);
            } else {
                notify.info("No 100% exact matched images found in internal database.");
            }
            
        } catch (err) {
            console.error(err);
            notify.error("Failed during DB auto apply.");
            setIsAutoApplying(false);
            setAutoApplyType(null);
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
        setAutoApplyType('cross_res');
        setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: 0 });

        try {
            // 1. Fetch the target restaurant's menu
            const res = await api.get(`/api/menu/${targetResId.trim()}`, {
                params: { platform: targetPlatform }
            });

            if (!res.data?.success || !res.data?.data?.menu) {
                notify.error("Failed to load target restaurant menu.");
                setIsAutoApplying(false);
                setAutoApplyType(null);
                return;
            }

            const targetMenu = res.data.data.menu;

            // 2. Extract candidate items with media and diet/veg info
            const candidateItems = [];
            targetMenu.forEach(cat => {
                cat.sub_category?.forEach(subcat => {
                    subcat.items?.forEach(candItem => {
                        const name = candItem.name?.trim();
                        let media = [];
                        if (candItem.media && candItem.media.length > 0) {
                            media = candItem.media;
                        } else if (candItem.image_url) {
                            media = [{ url: candItem.image_url, thumbUrl: candItem.image_url }];
                        }
                        if (name && media.length > 0) {
                            candidateItems.push({
                                name,
                                is_veg: candItem.is_veg ?? candItem.dietary_preference ?? candItem.diet_type,
                                media
                            });
                        }
                    });
                });
            });

            if (candidateItems.length === 0) {
                notify.warning(`Target restaurant menu has no items with images on ${targetPlatform}.`);
                setIsAutoApplying(false);
                setAutoApplyType(null);
                return;
            }

            const thresholdFraction = (similarityThreshold || 70) / 100;
            const isVeg = (v) => v === true || v === 1 || String(v).toUpperCase() === 'VEG';
            const isNonVeg = (v) => v === false || v === 0 || String(v).toUpperCase() === 'NON_VEG' || String(v).toUpperCase() === 'NON-VEG';

            // 3. Match items and update
            let completedCount = 0;
            let appliedCount = 0;
            const chunkSize = 2; // Process 2 at a time

            for (let i = 0; i < itemsWithoutMedia.length; i += chunkSize) {
                const chunk = itemsWithoutMedia.slice(i, i + chunkSize);
                
                const fetchPromises = chunk.map(async (item) => {
                    try {
                        let bestCandidate = null;
                        let bestScore = 0;

                        // Match against candidate items adhering to fuzziness threshold
                        for (const cand of candidateItems) {
                            // Dietary compatibility check (prevent mixing strictly veg and non-veg)
                            if (item.is_veg && cand.is_veg) {
                                if (isVeg(item.is_veg) && isNonVeg(cand.is_veg)) continue;
                                if (isNonVeg(item.is_veg) && isVeg(cand.is_veg)) continue;
                            }

                            const score = getMatchScore(item.name, cand.name, thresholdFraction);
                            if (score > 0 && score > bestScore) {
                                bestScore = score;
                                bestCandidate = cand;
                                if (score >= 0.99) break; // Perfect match found
                            }
                        }

                        if (!bestCandidate || !bestCandidate.media || bestCandidate.media.length === 0) {
                            return { itemId: item.id, media: [], matched: false };
                        }

                        const sourceMediaArray = bestCandidate.media;
                        const sourceImageUrl = sourceMediaArray[0].url || sourceMediaArray[0].thumbUrl || sourceMediaArray[0].image_url;

                        if (!sourceImageUrl) {
                            return { itemId: item.id, media: [], matched: false };
                        }

                        // Show temporary uploading state
                        updateItem({
                            itemId: item.id,
                            updates: {
                                media: [{
                                    tempReferenceId: `temp-cross-${crypto.randomUUID()}`,
                                    url: '',
                                    isUploading: true,
                                    uploadText: `Copying from ${targetPlatform} (${(bestScore * 100).toFixed(0)}% match)...`
                                }]
                            }
                        });

                        let finalMedia = [];

                        if (activePlatform !== "swiggy") {
                            // Upload to platform to ensure proper tracking and approval
                            const uploadRes = await uploadPlatformImage(activePlatform, activeResId, sourceImageUrl, item.name, item.originalId || item.id);
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

                        return { itemId: item.id, media: finalMedia, matched: finalMedia.length > 0 };
                    } catch (e) {
                        console.error(`Failed to apply cross-res image for ${item.name}`, e);
                        return { itemId: item.id, media: [], matched: false };
                    }
                });

                const results = await Promise.all(fetchPromises);
                
                results.forEach(result => {
                    const { itemId, media, matched } = result;
                    if (matched && media && media.length > 0) {
                        appliedCount++;
                        updateItem({ itemId, updates: { media } });
                    } else {
                        updateItem({ itemId, updates: { media: [] } });
                    }
                });
                
                completedCount += chunk.length;
                setAutoApplyProgress({ total: itemsWithoutMedia.length, completed: completedCount });
                
                // Rate limit: wait between chunks
                if (i + chunkSize < itemsWithoutMedia.length) {
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            setIsAutoApplying(false);
            setAutoApplyType(null);

            if (appliedCount > 0) {
                notify.success(`Copied images for ${appliedCount} matching items (at ≥${similarityThreshold}% similarity)!`);
            } else {
                notify.warning(`No items found matching the ≥${similarityThreshold}% similarity threshold. Try lowering the threshold.`);
            }

        } catch (err) {
            console.error(err);
            notify.error("Failed during cross-restaurant copy.");
            setIsAutoApplying(false);
            setAutoApplyType(null);
        }
    };

    const handleDropImage = async (itemId, mediaArray) => {
        updateItem({ itemId, updates: { media: mediaArray } });
    };

    if (!allItems || allItems.length === 0) {
        return (
            <div className="flex-1 flex flex-col gap-2 items-center justify-center text-muted-foreground min-h-[300px]">
                <ImageIcon size={32} className="stroke-1 text-muted-foreground/60" />
                <p className="text-sm font-medium">No items available to edit.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden relative bg-neutral-50/40">
            {/* Main Content Pane */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 transition-all duration-300 ease-in-out ${isImageSidebarOpen ? 'lg:w-1/2 lg:pr-4 lg:mr-[50%] w-full' : 'w-full'}`}>
                <div className="mx-auto space-y-4 sm:space-y-6">
                    {/* Header Banner */}
                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center border-b border-neutral-200/60 pb-4 gap-3 sm:gap-4 relative">
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 truncate">Image Editor</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Select an item to refine search options or instantly update assets via drag & drop.
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full xl:w-auto">
                            <Button
                                variant="secondary"
                                onClick={handleRemoveAllImages}
                                disabled={isAutoApplying}
                                className={`h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold border transition-colors ${
                                    removeConfirm
                                        ? 'bg-red-500 hover:bg-red-600 text-white border-red-500'
                                        : 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                                }`}
                            >
                                <Trash2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                <span>{removeConfirm ? 'Confirm Remove?' : 'Remove All'}</span>
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleAutoApplyImages}
                                disabled={isAutoApplying}
                                className="h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors relative overflow-hidden shrink-0"
                            >
                                {autoApplyType === 'dataset' ? (
                                    <>
                                        <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-indigo-600" />
                                        <span>Applying ({autoApplyProgress.completed}/{autoApplyProgress.total})</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500" />
                                        <span>Auto Apply Images</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleAutoApplyFoodsnapPlus}
                                disabled={isAutoApplying}
                                className="h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors relative overflow-hidden shrink-0"
                            >
                                {autoApplyType === 'foodsnap_plus' ? (
                                    <>
                                        <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-purple-600" />
                                        <span>Applying ({autoApplyProgress.completed}/{autoApplyProgress.total})</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
                                        <span>Auto-fill from Foodsnap Plus</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={handleApplyFromDB}
                                disabled={isAutoApplying}
                                className="h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors relative overflow-hidden shrink-0"
                            >
                                {autoApplyType === 'db' ? (
                                    <>
                                        <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-emerald-600" />
                                        <span>Applying ({autoApplyProgress.completed}/{autoApplyProgress.total})</span>
                                    </>
                                ) : (
                                    <>
                                        <Database className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" />
                                        <span>Auto-fill from DB</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setIsCrossResModalOpen(true)}
                                disabled={isAutoApplying}
                                className="h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors relative overflow-hidden shrink-0"
                            >
                                {autoApplyType === 'cross_res' ? (
                                    <>
                                        <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-amber-600" />
                                        <span>Copying ({autoApplyProgress.completed}/{autoApplyProgress.total})</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                                        <span>Copy from Rest.</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setIsDriveImportModalOpen(true)}
                                disabled={isAutoApplying}
                                className="h-8.5 sm:h-9 rounded-lg px-3 sm:px-4 text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 transition-colors relative overflow-hidden shrink-0 shadow-xs"
                            >
                                <Cloud className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-teal-600" />
                                <span>Import from Drive</span>
                            </Button>
                        </div>
                        
                        {/* Progress Bar under the header */}
                        {isAutoApplying && (
                            <div className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-neutral-100 overflow-hidden">
                                <div 
                                    className={`h-full transition-all duration-300 ease-out ${
                                        autoApplyType === 'foodsnap_plus' ? 'bg-purple-600' :
                                        autoApplyType === 'db' ? 'bg-emerald-600' :
                                        autoApplyType === 'cross_res' ? 'bg-amber-600' :
                                        'bg-indigo-600'
                                    }`}
                                    style={{ width: `${Math.min(100, (autoApplyProgress.completed / Math.max(1, autoApplyProgress.total)) * 100)}%` }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Responsive Grid of Dishes */}
                    <div className={`grid gap-3 sm:gap-4 transition-all duration-300 ${
                        isImageSidebarOpen
                            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'
                    }`}>
                        {allItems.map((item, index) => (
                            <ImageCard
                                key={item._uniqueKey || `${item.id}-${index}`}
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
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle>Copy Images from Restaurant</DialogTitle>
                        <DialogDescription>
                            Enter the Restaurant ID, platform, and match similarity threshold to map and transfer dish images.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="resId">Restaurant ID</Label>
                            <Input
                                id="resId"
                                value={targetResId}
                                onChange={(e) => setTargetResId(e.target.value)}
                                placeholder="e.g. 18464619 or RN562883"
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
                                    <SelectItem value="ownly">Ownly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Match Fuzziness / Similarity Selector */}
                        <div className="grid gap-2.5 pt-1">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="similarityThreshold" className="text-xs font-semibold text-neutral-800">
                                    Match Similarity / Fuzziness
                                </Label>
                                <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                    ≥ {similarityThreshold}% match
                                </span>
                            </div>

                            <input
                                id="similarityThreshold"
                                type="range"
                                min="50"
                                max="100"
                                step="5"
                                value={similarityThreshold}
                                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                                className="w-full accent-amber-600 cursor-pointer h-2 bg-neutral-200 rounded-lg appearance-none"
                            />

                            <div className="flex items-center justify-between gap-1.5 pt-0.5">
                                {[60, 70, 80, 90, 100].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setSimilarityThreshold(preset)}
                                        className={`flex-1 py-1 px-1.5 text-[11px] font-medium rounded border transition-colors ${
                                            similarityThreshold === preset
                                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                                : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-600 border-neutral-200'
                                        }`}
                                    >
                                        {preset === 100 ? '100% (Exact)' : `${preset}%`}
                                    </button>
                                ))}
                            </div>

                            <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                                Maps and copies photos for dishes matching at or above <strong className="text-neutral-700 font-semibold">{similarityThreshold}%</strong> similarity (e.g. &ldquo;Afghani Chaap (350 Gram)&rdquo; matches &ldquo;Afghani Soya Chaap&rdquo;).
                            </p>
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

            {/* Google Drive Import Modal */}
            {googleClientId ? (
                <GoogleOAuthProvider clientId={googleClientId}>
                    <GoogleDriveImportModal
                        isOpen={isDriveImportModalOpen}
                        onClose={() => setIsDriveImportModalOpen(false)}
                        allItems={allItems}
                        updateItem={updateItem}
                        activeResId={activeResId}
                        activePlatform={activePlatform}
                    />
                </GoogleOAuthProvider>
            ) : null}
        </div>
    );
}