"use client";

import * as React from "react";
import {
    Save,
    Loader2,
    History,
    Sparkles,
    Image as ImageIcon,
    Search,
    ChevronRight
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api/axios";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import SyncHistoryPanel from "./sync-history-panel";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function MenuEditorHeader({
    onSave,
    isSaving,
}) {
    const { menuData, isLoading, error, syncZomatoMenu, syncSwiggyMenu, syncPetpoojaMenu, isSyncing, activeResId: resId, activePlatform, updateItem, setActiveCategory, setActiveSubCategory, setActiveView, globalSearchQuery, setGlobalSearchQuery, updated_menu, markMenuUpdatesDone, getMenuByResId } = useMenu();
    const notification = useNotification();

    const { restaurants: zomatoRestaurants } = useRestaurant();
    const { restaurants: swiggyRestaurants } = useSwiggyRestaurant();
    const [activeSyncProgress, setActiveSyncProgress] = useState(null);

    const isSwiggy = activePlatform === 'swiggy';
    const isPetpooja = activePlatform === 'petpooja';

    const menuArray = Array.isArray(menuData) ? menuData : [];
    const totalCategories = menuArray.length;

    const stats = React.useMemo(() => {
        let total = 0;
        let withMedia = 0;
        let onHold = 0;
        let onHoldWithMedia = 0;

        menuArray.forEach(cat => {
            if (cat.status === 'delete' || cat.status === 'deleted') return;
            (cat.sub_category || []).forEach(sub => {
                if (sub.status === 'delete' || sub.status === 'deleted') return;
                (sub.items || []).forEach(item => {
                    if (item.status === 'delete' || item.status === 'deleted') return;
                    total++;
                    const hasMedia = item.media && item.media.length > 0;
                    if (hasMedia) withMedia++;
                    if (item.onHold) {
                        onHold++;
                        if (hasMedia) onHoldWithMedia++;
                    }
                });
            });
        });

        return {
            total,
            withMedia,
            withoutMedia: total - withMedia,
            onHold,
            onHoldWithMedia
        };
    }, [menuArray]);

    const hasUnsavedChanges = React.useMemo(() => {
        let unsaved = false;

        const isTemp = (id) => typeof id === 'string' && id.startsWith('temp-');

        menuArray.forEach(cat => {
            if (cat.temp_id || isTemp(cat.id)) unsaved = true;
            (cat.sub_category || []).forEach(sub => {
                if (sub.temp_id || isTemp(sub.id)) unsaved = true;
                (sub.items || []).forEach(item => {
                    if (item.temp_id || isTemp(item.id)) unsaved = true;
                    (item.variants || []).forEach(v => {
                        if (v.temp_id || isTemp(v.id)) unsaved = true;
                    });
                    (item.media || []).forEach(m => {
                        if (m.tempReferenceId || isTemp(m.id)) unsaved = true;
                    });
                });
            });
        });
        return unsaved;
    }, [menuArray]);

    const [isSyncModalOpen, setSyncModalOpen] = useState(false);

    const handleSync = async () => {
        try {
            if (isPetpooja) {
                await syncPetpoojaMenu(resId);
                notification.success("Menu synced with Petpooja successfully!", { duration: 3000 });
            } else if (isSwiggy) {
                await syncSwiggyMenu(resId);
                notification.success("Menu synced with Swiggy successfully!", { duration: 3000 });
            } else {
                await syncZomatoMenu(resId);
                notification.success("Menu synced with Zomato successfully!", { duration: 3000 });
            }
        } catch (err) {
            console.error("Failed to sync menu:", err);
            notification.error("Failed to sync menu: " + (err.message || "Unknown error"), { duration: 5000 });
        }
    };

    const [isTriggering, setIsTriggering] = useState(false);
    const [isSyncHistoryOpen, setIsSyncHistoryOpen] = useState(false);
    const notify = useNotification()

    const handleTriggerMenu = async () => {
        if (!resId) {
            notify.error("Restaurant ID is missing");
            return;
        }

        let invalidItems = [];
        let itemsMissingDescription = [];

        menuArray.forEach(cat => {
            if (cat.status === 'delete' || cat.status === 'deleted') return;
            (cat.sub_category || []).forEach(sub => {
                if (sub.status === 'delete' || sub.status === 'deleted') return;
                (sub.items || []).forEach(item => {
                    if (item.status === 'delete' || item.status === 'deleted') return;

                    if (!item.base_price || item.base_price === 0) {
                        invalidItems.push(item.name);
                    }

                    // Description is mandatory for NEW items on Swiggy
                    if (isSwiggy && String(item.id).startsWith("temp-") && (!item.description || item.description.trim() === "")) {
                        itemsMissingDescription.push(item.name);
                    }
                });
            });
        });

        if (invalidItems.length > 0) {
            const names = invalidItems.join(", ");
            notify.error(`Cannot trigger menu: The following items are missing a price (₹0): ${names}. Please update them before triggering.`, { duration: 6000 });
            return;
        }

        if (itemsMissingDescription.length > 0) {
            const names = itemsMissingDescription.join(", ");
            notify.error(`Cannot trigger menu: Description is mandatory for new Swiggy items. Missing on: ${names}.`, { duration: 6000 });
            return;
        }

        try {
            setIsTriggering(true);

            let url = `/api/menu/${resId}/zomato/update-menu`;
            let payload = {};

            if (isSwiggy) {
                url = `/api/menu/${resId}/swiggy/queue-changes`;

                let final_updated_menu = updated_menu;
                const isUpdatedMenuEmpty = !updated_menu ||
                    (!updated_menu.categories?.length &&
                        !updated_menu.sub_categories?.length &&
                        !updated_menu.items?.length);

                if (isUpdatedMenuEmpty && hasUnsavedChanges) {
                    const generated = { categories: [], sub_categories: [], items: [] };
                    const isTemp = (id) => typeof id === 'string' && id.startsWith('temp-');

                    menuArray.forEach(c => {
                        const catHasUnsaved = c.temp_id || isTemp(c.id);
                        if (catHasUnsaved) {
                            generated.categories.push({
                                id: c.id, name: c.name, action: c.temp_id?.startsWith('delete-') ? "delete" : isTemp(c.id) ? "create" : "update"
                            });
                        }

                        (c.sub_category || []).forEach(s => {
                            const subHasUnsaved = s.temp_id || isTemp(s.id);
                            if (subHasUnsaved) {
                                generated.sub_categories.push({
                                    id: s.id, categoryId: c.id, name: s.name, action: s.temp_id?.startsWith('delete-') ? "delete" : isTemp(s.id) ? "create" : "update"
                                });
                            }

                            (s.items || []).forEach(i => {
                                let itemHasUnsaved = i.temp_id || isTemp(i.id);
                                if (!itemHasUnsaved) {
                                    (i.variants || []).forEach(v => { if (v.temp_id || isTemp(v.id)) itemHasUnsaved = true; });
                                    (i.media || []).forEach(m => { if (m.tempReferenceId || isTemp(m.id)) itemHasUnsaved = true; });
                                }

                                if (itemHasUnsaved) {
                                    generated.items.push({
                                        id: i.id, categoryId: c.id, categoryName: c.name, subCategoryId: s.id, subCategoryName: s.name, ...i, action: i.temp_id?.startsWith('delete-') ? "delete" : isTemp(i.id) ? "create" : "update"
                                    });
                                }
                            });
                        });
                    });
                    final_updated_menu = generated;
                }

                payload = { updated_menu: final_updated_menu || { categories: [], sub_categories: [], items: [] } };
            }

            const res = await api.post(url, payload);

            if (isSwiggy) {
                markMenuUpdatesDone();

                const syncId = res.data?.syncId;
                if (syncId) {
                    // Poll until the sync job finishes
                    const pollInterval = setInterval(async () => {
                        try {
                            const { data } = await api.get(`/api/menu/${resId}/swiggy/sync-history`);
                            if (data.success) {
                                const currentSync = data.data.find(job => job._id === syncId);
                                if (currentSync) {
                                    const cats = currentSync.updated_menu?.categories || [];
                                    const subs = currentSync.updated_menu?.sub_categories || [];
                                    const items = currentSync.updated_menu?.items || [];
                                    const allTasks = [...cats, ...subs, ...items];

                                    const total = allTasks.length;
                                    const completed = allTasks.filter(t => t.status === 'completed').length;
                                    const failed = allTasks.filter(t => t.status === 'failed').length;

                                    setActiveSyncProgress({
                                        total,
                                        completed,
                                        failed,
                                        status: currentSync.status
                                    });

                                    if (currentSync.status === 'completed' || currentSync.status === 'failed') {
                                        clearInterval(pollInterval);

                                        if (currentSync.status === 'completed') {
                                            notification.success("Background menu sync completed successfully!");
                                        } else {
                                            notification.error("Background menu sync finished with some failures.", { duration: 5000 });
                                        }

                                        // Clear the progress bar after 6 seconds
                                        setTimeout(() => setActiveSyncProgress(null), 6000);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Polling error", e);
                        }
                    }, 2000);

                    // Cleanup interval after 5 minutes just in case
                    setTimeout(() => {
                        clearInterval(pollInterval);
                        setActiveSyncProgress(null);
                    }, 5 * 60 * 1000);
                } else {
                    setTimeout(() => getMenuByResId(resId), 800);
                }
            }

            if (isSwiggy) {
                notification.success("Menu queued to Swiggy — syncing in background!");
            } else {
                notification.success("Zomato Menu successfully triggered!");
            }
        } catch (error) {
            console.error(error);
            notification.error(error?.response?.data?.message || error.message || "Failed to trigger menu");
        } finally {
            setIsTriggering(false);
        }
    };

    return (
        <>
            <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md flex flex-col shrink-0 shadow-sm">
                <div className="flex items-center justify-between px-4 py-2.5 w-full gap-4 overflow-x-auto hide-scrollbar">
                    {/* Left Side: Stats Pill Row */}
                    <div className="flex items-center gap-5 min-w-0 flex-1">
                        {isLoading ? (
                            <div className="flex items-center gap-2.5">
                                <Skeleton className="h-[30px] w-[70px] rounded-md bg-blue-100/40" />
                                <Skeleton className="h-[30px] w-[70px] rounded-md bg-emerald-100/40" />
                                <Skeleton className="h-[30px] w-[80px] rounded-md bg-orange-100/40" />
                                <Skeleton className="h-[30px] w-[60px] rounded-md bg-red-100/40" />
                                <Skeleton className="h-[30px] w-[90px] rounded-md bg-purple-100/40" />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5 text-[11px] font-medium">
                                <div className="flex items-center gap-1.5 bg-muted/40 px-2 py-1.5 rounded-md border border-border/40 transition-colors hover:bg-muted/80 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="text-foreground font-bold">{stats.total}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-emerald-50/50 px-2 py-1.5 rounded-md border border-emerald-100 transition-colors hover:bg-emerald-50 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                                    <span className="text-emerald-700/70">Media:</span>
                                    <span className="text-emerald-950 font-bold">{stats.withMedia}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-orange-50/50 px-2 py-1.5 rounded-md border border-orange-100 transition-colors hover:bg-orange-50 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                                    <span className="text-orange-700/70">No Media:</span>
                                    <span className="text-orange-950 font-bold">{stats.withoutMedia}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-red-50/50 px-2 py-1.5 rounded-md border border-red-100 transition-colors hover:bg-red-50 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                                    <span className="text-red-700/70">Hold:</span>
                                    <span className="text-red-950 font-bold">{stats.onHold}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-purple-50/50 px-2 py-1.5 rounded-md border border-purple-100 transition-colors hover:bg-purple-50 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></span>
                                    <span className="text-purple-700/70">Hold+Media:</span>
                                    <span className="text-purple-950 font-bold">{stats.onHoldWithMedia}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Center: Search Bar */}
                    <div className="flex-1 max-w-sm mx-4 relative hidden md:block" style={{ zIndex: 100 }}>
                        {isLoading ? (
                            <Skeleton className="w-full h-8 rounded-md bg-muted/60" />
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                                <input
                                    type="text"
                                    placeholder="Search all items..."
                                    value={globalSearchQuery}
                                    onChange={(e) => {
                                        setGlobalSearchQuery(e.target.value);
                                        if (e.target.value.trim() !== "") {
                                            setActiveView("MENU");
                                        }
                                    }}
                                    className="w-full pl-9 pr-4 py-1.5 bg-gray-100 border-none rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Side: Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                        {isLoading ? (
                            <>
                                <Skeleton className="h-10 w-32 rounded-lg bg-muted/60" />
                                <Skeleton className="h-10 w-36 rounded-lg bg-muted/60" />
                                <Skeleton className="h-10 w-36 rounded-lg bg-muted/60" />
                                {isSwiggy && <Skeleton className="h-10 w-10 rounded-lg bg-muted/60" />}
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        if (hasUnsavedChanges) {
                                            setSyncModalOpen(true);
                                        } else {
                                            handleSync();
                                        }
                                    }}
                                    disabled={isSyncing || isLoading}
                                    className="h-10 rounded-lg px-5 bg-[#e23744] hover:bg-[#cb202d] text-white border-transparent hover:text-white transition-colors"
                                >
                                    {isSyncing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <History className="mr-2 h-4 w-4" />
                                    )}
                                    Sync Menu
                                </Button>

                                <Button
                                    id="global-save-btn"
                                    onClick={onSave}
                                    disabled={isSaving || isLoading}
                                    className="h-10 rounded-lg px-6 shadow-md"
                                >
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="mr-2 h-4 w-4" />
                                            Save Changes
                                        </>
                                    )}
                                </Button>

                                <Button
                                    onClick={handleTriggerMenu}
                                    disabled={isTriggering || (activeSyncProgress && (activeSyncProgress.status === 'pending' || activeSyncProgress.status === 'processing'))}
                                    className="h-10 rounded-lg px-5 bg-green-600 hover:bg-green-700 text-white shadow-md transition-colors relative"
                                >
                                    {isTriggering ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="mr-2 h-4 w-4" />
                                    )}
                                    Trigger Menu
                                    {hasUnsavedChanges && (
                                        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse border-2 border-white"></span>
                                    )}
                                </Button>

                                {activeSyncProgress && (
                                    <div className="flex flex-col justify-center gap-1.5 w-40 text-xs font-medium bg-muted/40 px-3 py-1.5 rounded-lg border border-border shadow-sm relative overflow-hidden">
                                        {activeSyncProgress.status === 'completed' && (
                                            <div className="absolute inset-0 bg-green-100/50 flex items-center justify-center text-green-700 font-bold backdrop-blur-[1px] z-10 transition-opacity">
                                                Completed!
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center text-muted-foreground z-0">
                                            <span className="flex items-center gap-1.5">
                                                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                                Syncing
                                            </span>
                                            <span className="font-mono">{activeSyncProgress.completed + activeSyncProgress.failed}/{activeSyncProgress.total}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden z-0 shadow-inner">
                                            <div
                                                className={`h-1.5 rounded-full ${activeSyncProgress.failed > 0 ? 'bg-orange-500' : 'bg-green-500'} transition-all duration-300 ease-out`}
                                                style={{ width: `${activeSyncProgress.total > 0 ? ((activeSyncProgress.completed + activeSyncProgress.failed) / activeSyncProgress.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {isSwiggy && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsSyncHistoryOpen(true)}
                                        className="h-10 rounded-lg px-4 border-gray-200 shadow-sm hover:bg-gray-50"
                                        title="View Sync Queue History"
                                    >
                                        <History className="h-4 w-4" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>

            </header>

            <SyncHistoryPanel
                isOpen={isSyncHistoryOpen}
                onClose={() => setIsSyncHistoryOpen(false)}
                resId={resId}
            />

            <AlertDialog open={isSyncModalOpen} onOpenChange={setSyncModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved Changes Detected</AlertDialogTitle>
                        <AlertDialogDescription>
                            You have unsaved changes. Your progress will be lost if you sync now. Please trigger and save your changes to Zomato first, or proceed to discard your local edits.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setSyncModalOpen(false)}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => {
                                setSyncModalOpen(false);
                                handleSync();
                            }}>
                            Discard & Sync
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}