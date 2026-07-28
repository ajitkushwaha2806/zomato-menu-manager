"use client";

import { useEffect, useRef, useState } from "react";
import { useMenu } from "@/store/hooks/useMenu";
import { uploadSwiggyImage } from "@/services/swiggyImageService";
import api from "@/lib/api/axios";

export default function ImageMigrationTracker() {
    const { menuData, activePlatform, activeResId, updateItem, setImageUploadStatus } = useMenu();
    const inProgressIds = useRef(new Set());
    const activeUploads = useRef(0);
    const MAX_CONCURRENT = 2;
    const processNextImageRef = useRef(null);
    
    // Keep a fresh reference to menuData so we don't need to depend on it in the main useEffect
    const menuDataRef = useRef(menuData);
    useEffect(() => {
        menuDataRef.current = menuData;
    }, [menuData]);
    
    // We only want this to run when on the Swiggy platform
    useEffect(() => {
        if (activePlatform !== "swiggy" || !activeResId) return;

        let isMounted = true;

        const findNextZomatoImage = () => {
            if (!Array.isArray(menuDataRef.current)) return null;
            
            for (const cat of menuDataRef.current) {
                for (const sub of cat.sub_category || cat.sub_categories || []) {
                    for (const item of sub.items || []) {
                        if (inProgressIds.current.has(item.id)) continue;

                        if (item.media && item.media.length > 0) {
                            const firstMedia = item.media[0];
                            // Check if it's a Zomato image and not already marked as rejected
                            if (
                                firstMedia.url && 
                                firstMedia.url.includes("zmtcdn.com") &&
                                !firstMedia.mediaTags?.some(t => t.tagSlug === "rejected")
                            ) {
                                return { item, catId: cat.id, subId: sub.id };
                            }
                        }
                    }
                }
            }
            return null;
        };

        const processNextImage = async () => {
            if (activeUploads.current >= MAX_CONCURRENT) return;

            const next = findNextZomatoImage();
            if (!next) return; // All done or nothing to do

            activeUploads.current += 1;
            inProgressIds.current.add(next.item.id);

            // Immediately try to start another one if we have capacity!
            if (activeUploads.current < MAX_CONCURRENT) {
                processNextImage();
            }

            const { item, catId, subId } = next;
            const zomatoUrl = item.media[0].url;

            try {
                // 1. Show loading UI directly on the image card using the Auto Apply styling!
                updateItem({
                    categoryId: catId,
                    subCategoryId: subId,
                    itemId: item.id,
                    updates: {
                        media: [{
                            ...item.media[0],
                            isUploading: true,
                            uploadText: "MIGRATING"
                        }]
                    }
                });

                // 2. Upload to Swiggy
                const uploadRes = await uploadSwiggyImage(activeResId, zomatoUrl, item.name);
                
                if (uploadRes.success && uploadRes.file_url) {
                    const swiggyUrl = uploadRes.file_url;
                    const swiggyImageId = uploadRes.stableDiffusion?.data?.image_id || null;

                    // 3. Update DB directly so progress is not lost
                    await api.put(`/api/menu/${activeResId}/swiggy/items/update-image`, {
                        itemId: item.id,
                        imageId: swiggyImageId,
                        imageUrl: swiggyUrl
                    });

                    // 4. Update Redux state so UI immediately reflects the change
                    // We must use the latest function reference if we didn't memoize it
                    updateItem({
                        categoryId: catId,
                        subCategoryId: subId,
                        itemId: item.id,
                        updates: {
                            media: [{
                                mediaId: swiggyImageId,
                                url: swiggyUrl,
                                mediaType: "PHOTO",
                                source: "SWIGGY_IMAGE_MIGRATION"
                            }]
                        }
                    });
                }
            } catch (err) {
                console.error(`Failed to migrate image for item ${item.name}:`, err);
                
                // On failure, mark the media as rejected so it doesn't loop and UI shows error badge
                const failedMedia = {
                    ...item.media[0],
                    mediaTags: [{ tagSlug: 'rejected', reason: err?.message || 'Upload failed' }]
                };

                updateItem({
                    categoryId: catId,
                    subCategoryId: subId,
                    itemId: item.id,
                    updates: {
                        media: [failedMedia] 
                    }
                });
                
                // Also update DB so refresh remembers it was rejected
                await api.put(`/api/menu/${activeResId}/swiggy/items/update-image`, {
                    itemId: item.id,
                    imageId: null,
                    imageUrl: failedMedia.url,
                    mediaTags: failedMedia.mediaTags
                }).catch(() => {});
            } finally {
                // ALWAYS release locks even if unmounted
                activeUploads.current -= 1;
                inProgressIds.current.delete(item.id);
                
                // Immediately queue the next one
                setTimeout(processNextImage, 500);
            }
        };

        processNextImageRef.current = processNextImage;

        // Start processing initially
        processNextImage();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePlatform, activeResId]);

    // "Poke" the loop whenever menuData updates.
    // If the loop died because menuData was null or it temporarily ran out of items,
    // this will kickstart it again. If it's already running at max capacity, it will just cleanly return early!
    useEffect(() => {
        if (processNextImageRef.current) {
            processNextImageRef.current();
        }
    }, [menuData]);

    return null; // Hidden background component
}
