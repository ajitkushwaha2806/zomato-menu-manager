"use client";

import * as React from "react";
import {
    Save,
    Loader2,
    History,
    Sparkles,
    Image as ImageIcon,
    Search,
    ChevronRight,
    ChevronDown,
    Check,
    AlertTriangle,
    CheckCircle2,
    AlertCircle,
    Mail,
    X
} from "lucide-react";

import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMenu } from "@/store/hooks/useMenu";
import useNotification from "@/store/hooks/useNotification";
import { useState, useEffect, useRef } from "react";
import api from "@/lib/api/axios";
import CookieStorage from "@/services/cookie";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import useUser from "@/store/hooks/useUser";
import SyncHistoryPanel from "./sync-history-panel";
import { Switch } from "@/components/ui/switch";
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
    const { menuData, addonsData, deleteAllAddons, isLoading, error, syncZomatoMenu, syncSwiggyMenu, syncPetpoojaMenu, syncOwnlyMenu, isSyncing, activeResId: resId, activePlatform, updateItem, setActiveCategory, setActiveSubCategory, setActiveView, globalSearchQuery, setGlobalSearchQuery, updated_menu, markMenuUpdatesDone, getMenuByResId, taskId: dbTaskId, setTaskId, uploadQueue, clearAllImageUploadStatuses } = useMenu();
    const notification = useNotification();

    const { restaurants: zomatoRestaurants } = useRestaurant();
    const { restaurants: swiggyRestaurants } = useSwiggyRestaurant();
    const { user } = useUser();
    const [activeSyncProgress, setActiveSyncProgress] = useState(null);

    const [isOtpVerified, setIsOtpVerified] = useState(false);
    const [otpInput, setOtpInput] = useState("");
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [authMode, setAuthMode] = useState("task"); // 'task' | 'otp'

    const resList = activePlatform === 'swiggy' ? swiggyRestaurants : zomatoRestaurants;
    const safeResList = Array.isArray(resList) ? resList : (Array.isArray(resList?.entities) ? resList.entities : (Array.isArray(resList?.data) ? resList.data : []));
    const currentRes = safeResList.find(r => String(r.id) === String(resId) || String(r._id) === String(resId));
    const activeResName = currentRes?.name || currentRes?.restaurant_name || "Unknown Restaurant";

    useEffect(() => {
        if (!resId) return;
        setOtpInput("");
        setOtpSent(false);

        const localVerified = typeof window !== "undefined" ? localStorage.getItem(`otp_verified_${resId}`) : null;
        if (localVerified === "true") {
            setIsOtpVerified(true);
            return;
        }

        fetch(`/api/menu/${resId}/otp/verify`)
            .then(r => r.json())
            .then(data => {
                if (data.success && data.verified) {
                    setIsOtpVerified(true);
                    if (typeof window !== "undefined") {
                        localStorage.setItem(`otp_verified_${resId}`, "true");
                    }
                } else {
                    setIsOtpVerified(false);
                }
            })
            .catch(() => {});
    }, [resId]);

    const handleSendOtp = async () => {
        if (!resId) return;
        try {
            setIsSendingOtp(true);
            const res = await fetch(`/api/menu/${resId}/otp/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resName: activeResName,
                    userName: user?.name || user?.user?.name || "Menu Manager User",
                    userEmail: user?.email || user?.user?.email || "",
                }),
            });
            const data = await res.json();
            if (data.success) {
                setOtpSent(true);
                notification.success(data.message || "OTP sent to vishalkushwaha@magicscale.in");
            } else {
                notification.error(data.message || "Failed to send OTP.");
            }
        } catch (err) {
            console.error("Failed to send OTP:", err);
            notification.error(err?.message || "Failed to send OTP.");
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpInput.trim()) {
            notification.error("Please enter the 6-digit OTP.");
            return;
        }
        try {
            setIsVerifyingOtp(true);
            const res = await fetch(`/api/menu/${resId}/otp/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ otp: otpInput.trim() }),
            });
            const data = await res.json();
            if (data.success) {
                setIsOtpVerified(true);
                if (typeof window !== "undefined") {
                    localStorage.setItem(`otp_verified_${resId}`, "true");
                }
                notification.success("Restaurant unlocked via OTP! You can now trigger.");
            } else {
                notification.error(data.message || "Invalid OTP. Please check email and try again.");
            }
        } catch (err) {
            console.error("Failed to verify OTP:", err);
            notification.error(err?.message || "Failed to verify OTP.");
        } finally {
            setIsVerifyingOtp(false);
        }
    };

    const isSwiggy = activePlatform === 'swiggy';
    const isPetpooja = activePlatform === 'petpooja';
    const isOwnly = activePlatform === 'ownly';
    const isZomato = !isSwiggy && !isPetpooja && !isOwnly;

    const [petpoojaSession, setPetpoojaSession] = useState(null);
    const [isSwitchingPetpoojaPlatform, setIsSwitchingPetpoojaPlatform] = useState(false);

    const loadPetpoojaSession = React.useCallback(async () => {
        if (!isPetpooja || !resId) return;
        try {
            const res = await fetch(`/api/menu/${resId}/petpooja/session`);
            const json = await res.json();
            if (json.success && json.data) {
                setPetpoojaSession(json.data);
            }
        } catch (e) {
            console.warn("Could not load Petpooja session:", e);
        }
    }, [isPetpooja, resId]);

    useEffect(() => {
        if (isPetpooja && resId) {
            loadPetpoojaSession();
        } else {
            setPetpoojaSession(null);
        }
    }, [isPetpooja, resId, loadPetpoojaSession]);

    const handleSwitchPetpoojaPlatform = async (platform) => {
        try {
            setIsSwitchingPetpoojaPlatform(true);
            const payload = platform ? {
                client_id: platform.client_id || platform.clientId,
                mapped_res_id: platform.mapped_res_id || platform.mappedResId,
            } : { reset: true };

            const res = await fetch(`/api/menu/${resId}/petpooja/session`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                notification.success(data.message || "Petpooja platform switched!");
                if (data.data) {
                    setPetpoojaSession(data.data);
                }
                const queryParams = (payload.client_id && payload.mapped_res_id && !payload.reset)
                    ? `client_id=${payload.client_id}&mapped_res_id=${payload.mapped_res_id}`
                    : "";
                // Automatically sync the newly selected platform's menu
                await syncPetpoojaMenu({ resId, queryParams });
                await loadPetpoojaSession();
            } else {
                notification.error(data.message || "Failed to switch platform");
            }
        } catch (err) {
            console.error("Platform switch error:", err);
            notification.error(err.message || "Failed to switch platform");
        } finally {
            setIsSwitchingPetpoojaPlatform(false);
        }
    };

    const [isPetpoojaPublishing, setIsPetpoojaPublishing] = useState(false);
    const [isPetpoojaTriggerOpen, setIsPetpoojaTriggerOpen] = useState(false);
    const [selectedTriggerPlatform, setSelectedTriggerPlatform] = useState("current"); // "current" | "all"

    const petpoojaCurrentChannel = React.useMemo(() => {
        if (!petpoojaSession?.integrationOutlets) return null;
        const currentClientId = petpoojaSession?.platformSelection?.clientId ?? petpoojaSession?.platformSelection?.client_id;
        const matched = petpoojaSession.integrationOutlets.find(
            ch => String(ch.userId) === String(currentClientId)
        );
        return matched || petpoojaSession.integrationOutlets.find(ch => (ch.name || "").toLowerCase().includes("zomato")) || petpoojaSession.integrationOutlets[0] || null;
    }, [petpoojaSession]);

    const petpoojaCurrentOutlet = React.useMemo(() => {
        if (!petpoojaCurrentChannel?.outlets) return null;
        const currentMappedId = petpoojaSession?.platformSelection?.mappedResId ?? petpoojaSession?.platformSelection?.mapped_res_id;
        const matched = petpoojaCurrentChannel.outlets.find(
            o => String(o.mappedId) === String(currentMappedId)
        );
        return matched || petpoojaCurrentChannel.outlets[0] || null;
    }, [petpoojaCurrentChannel, petpoojaSession]);

    const petpoojaCurrentPlatformName = petpoojaCurrentChannel?.name || "Zomato";

    const handleTriggerPetpoojaPublish = async () => {
        try {
            setIsPetpoojaPublishing(true);
            const payload = {};
            if (selectedTriggerPlatform === "all") {
                payload.platform = "all";
            } else if (petpoojaCurrentChannel) {
                payload.userId = petpoojaCurrentChannel.userId;
                if (petpoojaCurrentOutlet) {
                    payload.mappedId = petpoojaCurrentOutlet.mappedId;
                }
            } else {
                payload.platform = petpoojaCurrentPlatformName.toLowerCase();
            }

            const res = await fetch(`/api/menu/${resId}/petpooja/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.success) {
                const targetText = selectedTriggerPlatform === "all" ? "Zomato & Swiggy" : petpoojaCurrentPlatformName;
                notification.success(data.message || `Menu publish triggered on ${targetText}!`, { duration: 5000 });
                setIsPetpoojaTriggerOpen(false);
                await loadPetpoojaSession();
            } else {
                notification.error(data.message || "Failed to trigger menu publish", { duration: 6000 });
            }
        } catch (err) {
            console.error("Petpooja publish trigger error:", err);
            notification.error(err?.message || "Failed to trigger menu publish", { duration: 6000 });
        } finally {
            setIsPetpoojaPublishing(false);
        }
    };

    const menuArray = Array.isArray(menuData) ? menuData : [];
    const totalCategories = menuArray.length;
    const isWhitelistedRes = String(resId) === '21';

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

    const zomatoItemsWithAddons = React.useMemo(() => {
        if (!isZomato) return [];
        const items = [];
        menuArray.forEach(cat => {
            if (cat.status === 'delete' || cat.status === 'deleted') return;
            (cat.sub_category || []).forEach(sub => {
                if (sub.status === 'delete' || sub.status === 'deleted') return;
                (sub.items || []).forEach(item => {
                    if (item.status === 'delete' || item.status === 'deleted') return;
                    const hasAddons = (Array.isArray(item.addons) && item.addons.length > 0) ||
                        (Array.isArray(item.addon_groups) && item.addon_groups.length > 0) ||
                        (Array.isArray(item.addonGroups) && item.addonGroups.length > 0);
                    if (hasAddons) {
                        items.push(item);
                    }
                });
            });
        });
        return items;
    }, [isZomato, menuArray]);

    const zomatoHasAddons = isZomato && (zomatoItemsWithAddons.length > 0 || (Array.isArray(addonsData) && addonsData.length > 0));

    const [isSyncModalOpen, setSyncModalOpen] = useState(false);

    const handleSync = async () => {
        try {
            if (clearAllImageUploadStatuses) clearAllImageUploadStatuses();
            if (isPetpooja) {
                const res = await syncPetpoojaMenu(resId);
                if (res?.error) {
                    throw new Error(res.error?.message || res.payload || "Failed to sync Petpooja menu");
                }
                notification.success("Menu synced with Petpooja successfully!", { duration: 3000 });
            } else if (isSwiggy) {
                const res = await syncSwiggyMenu(resId);
                if (res?.error) {
                    throw new Error(res.error?.message || res.payload || "Failed to sync Swiggy menu");
                }
                notification.success("Menu synced with Swiggy successfully!", { duration: 3000 });
            } else if (isOwnly) {
                const res = await syncOwnlyMenu(resId);
                if (res?.error) {
                    throw new Error(res.error?.message || res.payload || "Failed to sync Ownly menu");
                }
                notification.success("Menu synced with Ownly successfully!", { duration: 3000 });
            } else {
                const res = await syncZomatoMenu(resId);
                if (res?.error) {
                    throw new Error(res.error?.message || res.payload || "Failed to sync Zomato menu");
                }
                notification.success("Menu synced with Zomato successfully!", { duration: 3000 });
            }
        } catch (err) {
            console.error("Failed to sync menu:", err);
            const errMsg = err?.message || (typeof err === "string" ? err : "Unknown error");
            notification.error("Failed to sync menu: " + errMsg, { duration: 6000 });
        }
    };

    const [isTriggering, setIsTriggering] = useState(false);
    const [isSyncHistoryOpen, setIsSyncHistoryOpen] = useState(false);
    const [triggerTaskId, setTriggerTaskId] = useState("");
    const [isTriggerPopoverOpen, setIsTriggerPopoverOpen] = useState(false);
    const notify = useNotification()

    const [isSavingTaskId, setIsSavingTaskId] = useState(false);

    useEffect(() => {
        if (dbTaskId) {
            setTriggerTaskId(dbTaskId);
        } else {
            setTriggerTaskId("");
        }
    }, [dbTaskId, resId]);

    // Check for any ongoing sync on mount or platform switch
    useEffect(() => {
        if (!resId || (!isSwiggy && !isOwnly)) {
            setActiveSyncProgress(null);
            return;
        }
        const platformKey = isOwnly ? "ownly" : "swiggy";
        let isCancelled = false;
        let pollInterval = null;

        const checkActiveSync = async () => {
            try {
                const { data } = await api.get(`/api/menu/${resId}/${platformKey}/sync-history?limit=5`);
                if (isCancelled || !data?.success || !data.data?.length) return;
                const activeJob = data.data.find(job => job.status === "pending" || job.status === "processing");
                if (activeJob) {
                    const cats = activeJob.updated_menu?.categories || [];
                    const subs = activeJob.updated_menu?.sub_categories || [];
                    const items = activeJob.updated_menu?.items || [];
                    const allTasks = [...cats, ...subs, ...items];
                    const total = allTasks.length;
                    const completed = allTasks.filter(t => t.status === 'completed').length;
                    const failed = allTasks.filter(t => t.status === 'failed').length;

                    setActiveSyncProgress({
                        total,
                        completed,
                        failed,
                        status: activeJob.status
                    });

                    pollInterval = setInterval(async () => {
                        try {
                            const { data: pollData } = await api.get(`/api/menu/${resId}/${platformKey}/sync-history?limit=5`);
                            if (isCancelled || !pollData?.success) return;
                            const currentSync = pollData.data.find(job => job._id === activeJob._id);
                            if (currentSync) {
                                const cTasks = [
                                    ...(currentSync.updated_menu?.categories || []),
                                    ...(currentSync.updated_menu?.sub_categories || []),
                                    ...(currentSync.updated_menu?.items || [])
                                ];
                                setActiveSyncProgress({
                                    total: cTasks.length,
                                    completed: cTasks.filter(t => t.status === 'completed').length,
                                    failed: cTasks.filter(t => t.status === 'failed').length,
                                    status: currentSync.status
                                });
                                if (currentSync.status === 'completed' || currentSync.status === 'failed' || currentSync.status === 'completed_with_errors') {
                                    clearInterval(pollInterval);
                                    setTimeout(() => setActiveSyncProgress(null), 6000);
                                    await getMenuByResId({ resId, platform: platformKey });
                                }
                            }
                        } catch (e) {
                            console.error("Polling error", e);
                        }
                    }, 2500);
                }
            } catch (e) {
                console.error("Error checking active sync on load", e);
            }
        };

        checkActiveSync();

        return () => {
            isCancelled = true;
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [resId, isSwiggy, isOwnly]);

    const handleSaveTaskId = async () => {
        if (!triggerTaskId.trim()) {
            notify.error("Task ID is required");
            return;
        }
        try {
            setIsSavingTaskId(true);

            try {
                const validationRes = await fetch(`/api/validate-task?taskId=${triggerTaskId}`);
                if (validationRes.ok) {
                    const result = await validationRes.json();
                    if (result.success) {
                        const validationData = result.data;
                        if (!validationData.restIds || (!validationData.restIds.includes(resId) && !validationData.restIds.includes(String(resId)))) {
                            notify.error("This Task ID is not assigned to this restaurant.", { duration: 5000 });
                            setIsSavingTaskId(false);
                            return;
                        }
                    } else {
                        notify.error("Failed to validate Task ID with CRM.");
                        setIsSavingTaskId(false);
                        return;
                    }
                } else {
                    notify.error("Failed to validate Task ID with CRM.");
                    setIsSavingTaskId(false);
                    return;
                }
            } catch (err) {
                console.error("Task validation failed", err);
                notify.error("Failed to validate Task ID with CRM.");
                setIsSavingTaskId(false);
                return;
            }

            const { data } = await api.post(`/api/menu/${resId}/task-id`, {
                taskId: triggerTaskId,
                platform: isSwiggy ? "swiggy" : "zomato"
            });
            if (data?.success) {
                notify.success("Task ID saved successfully");
                setTaskId(triggerTaskId); // Update global state so it becomes disabled
            } else {
                notify.error(data?.message || "Failed to save Task ID");
            }
        } catch (error) {
            console.error(error);
            notify.error(error?.response?.data?.message || "Something went wrong");
        } finally {
            setIsSavingTaskId(false);
        }
    };

    const handleTriggerMenu = async (bypassTaskValidation = false) => {
        if (!resId) {
            notify.error("Restaurant ID is missing");
            return;
        }

        if (!bypassTaskValidation && !isOtpVerified) {
            if (!triggerTaskId.trim()) {
                notify.error("Task ID or Admin OTP verification is required to trigger the menu");
                return;
            }

            try {
                const validationRes = await fetch(`/api/validate-task?taskId=${triggerTaskId}`);
                if (validationRes.ok) {
                    const result = await validationRes.json();
                    if (result.success) {
                        const validationData = result.data;
                        if (!validationData.restIds || (!validationData.restIds.includes(resId) && !validationData.restIds.includes(String(resId)))) {
                            notify.error("This Task ID is not assigned to this restaurant.", { duration: 5000 });
                            return;
                        }
                    } else {
                        notify.error("Failed to validate Task ID with CRM.");
                        return;
                    }
                } else {
                    notify.error("Failed to validate Task ID with CRM.");
                    return;
                }
            } catch (err) {
                console.error("Task validation failed", err);
                notify.error("Failed to validate Task ID with CRM.");
                return;
            }
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

        // if (invalidItems.length > 0) {
        //     const names = invalidItems.join(", ");
        //     notify.error(`Cannot trigger menu: The following items are missing a price (₹0): ${names}. Please update them before triggering.`, { duration: 6000 });
        //     return;
        // }

        if (itemsMissingDescription.length > 0) {
            const names = itemsMissingDescription.join(", ");
            notify.error(`Cannot trigger menu: Description is mandatory for new Swiggy items. Missing on: ${names}.`, { duration: 6000 });
            return;
        }

        // Addons validation for Zomato
        // if (isZomato && zomatoHasAddons) {
        //     const names = zomatoItemsWithAddons.slice(0, 4).map(i => i.name).join(", ");
        //     const more = zomatoItemsWithAddons.length > 0 ? ` and ${zomatoItemsWithAddons.length - 0} more` : "";
        //     const msg = zomatoItemsWithAddons.length > 0
        //         ? `Cannot trigger Zomato menu: Addons are not allowed on Zomato due to an API bug. Found ${zomatoItemsWithAddons.length} item(s) with addons (${names}${more}). Please delete all addons before triggering.`
        //         : `Cannot trigger Zomato menu: Addons exist (${addonsData.length} group(s)). Please delete all addons before triggering.`;
        //     notify.error(msg, { duration: 8000 });
        //     return;
        // }

        try {
            setIsTriggering(true);

            let url = `/api/menu/${resId}/zomato/update-menu`;
            let payload = { taskId: triggerTaskId };

            if (isSwiggy || isOwnly) {
                const platformKey = isOwnly ? "ownly" : "swiggy";
                url = `/api/menu/${resId}/${platformKey}/queue-changes`;
                const accountName = isOwnly ? CookieStorage.getAccountName() : localStorage.getItem("swiggy_account");
                payload = { accountName, taskId: triggerTaskId };

                let final_updated_menu = updated_menu;
                const isUpdatedMenuEmpty = !updated_menu ||
                    (!updated_menu.categories?.length &&
                        !updated_menu.sub_categories?.length &&
                        !updated_menu.items?.length);

                if (isUpdatedMenuEmpty && hasUnsavedChanges) {
                    const generated = { categories: [], sub_categories: [], items: [] };
                    const isTemp = (id) => typeof id === 'string' && (id.startsWith('temp-') || id.startsWith('temp_'));

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
                                const isCatDeleted = c.temp_id?.startsWith('delete-') || c.status === 'delete';
                                const isSubDeleted = s.temp_id?.startsWith('delete-') || s.status === 'delete';
                                const isItemDeleted = i.temp_id?.startsWith('delete-') || i.status === 'delete';

                                let itemHasUnsaved = catHasUnsaved || subHasUnsaved || i.temp_id || isTemp(i.id) || isCatDeleted || isSubDeleted || isItemDeleted;
                                if (!itemHasUnsaved) {
                                    (i.variants || []).forEach(v => { if (v.temp_id || isTemp(v.id)) itemHasUnsaved = true; });
                                    (i.media || []).forEach(m => { if (m.tempReferenceId || isTemp(m.id)) itemHasUnsaved = true; });
                                }

                                if (itemHasUnsaved) {
                                    const action = (isCatDeleted || isSubDeleted || isItemDeleted)
                                        ? "delete"
                                        : (isTemp(i.id) ? "create" : "update");

                                    generated.items.push({
                                        id: i.id,
                                        categoryId: c.id,
                                        categoryName: c.name,
                                        subCategoryId: s.id,
                                        subCategoryName: s.name,
                                        ...i,
                                        action,
                                    });
                                }
                            });
                        });
                    });
                    final_updated_menu = isOwnly ? { items: generated.items } : generated;
                }

                payload = { ...payload, updated_menu: final_updated_menu || (isOwnly ? { items: [] } : { categories: [], sub_categories: [], items: [] }) };
            }

            const res = await api.post(url, payload);

            if (isSwiggy || isOwnly) {
                markMenuUpdatesDone();
                const platformKey = isOwnly ? "ownly" : "swiggy";

                const syncId = res.data?.syncId;
                if (syncId) {
                    // Poll until the sync job finishes
                    const pollInterval = setInterval(async () => {
                        try {
                            const { data } = await api.get(`/api/menu/${resId}/${platformKey}/sync-history`);
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

                                    if (currentSync.status === 'completed' || currentSync.status === 'failed' || currentSync.status === 'completed_with_errors') {
                                        clearInterval(pollInterval);

                                        if (currentSync.status === 'completed') {
                                            notification.success("Background menu sync completed successfully!");
                                        } else {
                                            notification.error("Background menu sync finished with some failures.", { duration: 5000 });
                                        }

                                        // Clear the progress bar after 6 seconds
                                        setTimeout(() => setActiveSyncProgress(null), 6000);
                                        if (platformKey === 'ownly') {
                                            try {
                                                await syncOwnlyMenu(resId);
                                            } catch (sErr) {
                                                console.warn("Could not sync Ownly menu directly:", sErr);
                                            }
                                        }
                                        await getMenuByResId({ resId, platform: platformKey });
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
                    setTimeout(() => getMenuByResId({ resId, platform: platformKey }), 800);
                }
            }

            if (res.data) {
                if (isSwiggy) {
                    notification.success("Swiggy Menu trigger queued successfully!");
                } else if (isOwnly) {
                    notification.success("Ownly Menu trigger queued successfully!");
                } else {
                    notification.success("Zomato Menu successfully triggered!");
                }

                // Update the taskId in the local store so it stays disabled and auto-filled
                setTaskId(triggerTaskId);
            }
        } catch (error) {
            console.error(error);
            notify.error(error?.response?.data?.message || error.message || "Failed to trigger menu");
        } finally {
            setIsTriggering(false);
            setIsTriggerPopoverOpen(false);
        }
    };

    return (
        <>
            <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-md flex flex-col shrink-0 shadow-xs">
                <div className="flex items-center justify-between px-3 py-1.5 w-full gap-2 overflow-x-auto hide-scrollbar min-w-0">
                    {/* Left Side: Stats Pill Row */}
                    <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        {isLoading ? (
                            <div className="flex items-center gap-1.5">
                                <Skeleton className="h-7 w-[65px] rounded-md bg-blue-100/40" />
                                <Skeleton className="h-7 w-[65px] rounded-md bg-emerald-100/40" />
                                <Skeleton className="h-7 w-[75px] rounded-md bg-orange-100/40" />
                                <Skeleton className="h-7 w-[55px] rounded-md bg-red-100/40" />
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0 whitespace-nowrap">
                                <div className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md border border-border/50 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="text-foreground font-bold">{stats.total}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-emerald-50/70 px-2 py-1 rounded-md border border-emerald-200/60 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                                    <span className="text-emerald-700/80">Media:</span>
                                    <span className="text-emerald-950 font-bold">{stats.withMedia}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-orange-50/70 px-2 py-1 rounded-md border border-orange-200/60 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
                                    <span className="text-orange-700/80">No Media:</span>
                                    <span className="text-orange-950 font-bold">{stats.withoutMedia}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-red-50/70 px-2 py-1 rounded-md border border-red-200/60 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                                    <span className="text-red-700/80">Hold:</span>
                                    <span className="text-red-950 font-bold">{stats.onHold}</span>
                                </div>
                                <div className="hidden xl:flex items-center gap-1.5 bg-purple-50/70 px-2 py-1 rounded-md border border-purple-200/60 whitespace-nowrap">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></span>
                                    <span className="text-purple-700/80">Hold+Media:</span>
                                    <span className="text-purple-950 font-bold">{stats.onHoldWithMedia}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Center: Search Bar */}
                    <div className="flex-1 min-w-[120px] max-w-[220px] mx-1.5 relative hidden md:block shrink">
                        {isLoading ? (
                            <Skeleton className="w-full h-8 rounded-md bg-muted/60" />
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={globalSearchQuery}
                                    onChange={(e) => {
                                        setGlobalSearchQuery(e.target.value);
                                        if (e.target.value.trim() !== "") {
                                            setActiveView("MENU");
                                        }
                                    }}
                                    className="w-full pl-7 pr-2.5 py-1 bg-gray-100 hover:bg-gray-100/80 focus:bg-white border border-transparent focus:border-border rounded-md text-xs transition-all focus:outline-none focus:ring-1 focus:ring-primary/20"
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Side: Actions */}
                    <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                        {isLoading ? (
                            <>
                                <Skeleton className="h-8 w-28 rounded-lg bg-muted/60" />
                                <Skeleton className="h-8 w-28 rounded-lg bg-muted/60" />
                                <Skeleton className="h-8 w-28 rounded-lg bg-muted/60" />
                                {(isSwiggy || isOwnly) && <Skeleton className="h-8 w-8 rounded-lg bg-muted/60" />}
                            </>
                        ) : (
                            <>
                                {isPetpooja && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={isSwitchingPetpoojaPlatform || isSyncing}
                                                className="h-8 px-2.5 rounded-lg border-emerald-500/30 bg-emerald-50/90 hover:bg-emerald-100 text-emerald-950 text-xs font-semibold gap-1.5 shadow-xs shrink-0 whitespace-nowrap"
                                                title="Select Petpooja outlet / channel"
                                            >
                                                {isSwitchingPetpoojaPlatform ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 shrink-0" />
                                                ) : (
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                                                )}
                                                <div className="flex items-center gap-1 text-left leading-none whitespace-nowrap">
                                                    <span className="text-[10px] text-emerald-800/80 uppercase font-bold">Outlet:</span>
                                                    <span className="font-bold text-xs truncate max-w-[110px] text-emerald-950">
                                                        {petpoojaSession?.activeMenuPlatform || (petpoojaSession?.platformSelection?.name || "Zomato")}
                                                    </span>
                                                </div>
                                                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-80 p-1.5 rounded-xl shadow-xl max-h-[80vh] overflow-y-auto">
                                            <DropdownMenuLabel className="text-xs px-2.5 py-1.5 font-semibold text-muted-foreground flex items-center justify-between">
                                                <span>Select Petpooja Channel / Outlet</span>
                                                <span className="text-[10px] font-normal text-muted-foreground">
                                                    ID: {resId}
                                                </span>
                                            </DropdownMenuLabel>

                                            {/* Integration Outlets (Zomato and Swiggy ONLY) */}
                                            {Array.isArray(petpoojaSession?.integrationOutlets) && petpoojaSession.integrationOutlets.length > 0 ? (
                                                petpoojaSession.integrationOutlets
                                                    .filter((channel) => {
                                                        const name = channel.name?.toLowerCase() || "";
                                                        return name.includes("zomato") || name.includes("swiggy");
                                                    })
                                                    .sort((a, b) => {
                                                        const aZomato = a.name?.toLowerCase().includes("zomato") ? 0 : 1;
                                                        const bZomato = b.name?.toLowerCase().includes("zomato") ? 0 : 1;
                                                        return aZomato - bZomato;
                                                    })
                                                    .map((channel) => {
                                                    const isAggregator = Array.isArray(channel.outlets) && channel.outlets.length > 0;
                                                    const isZomato = channel.name?.toLowerCase().includes("zomato");
                                                    const isSwiggy = channel.name?.toLowerCase().includes("swiggy");
                                                    const dotColor = isZomato ? "bg-red-500" : isSwiggy ? "bg-orange-500" : "bg-blue-500";

                                                    return (
                                                        <div key={channel.userId} className="my-1 border-t border-border/40 pt-1">
                                                            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                                                <span className="flex items-center gap-1.5">
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                                                    {channel.name}
                                                                </span>
                                                                {channel.count > 0 && (
                                                                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-normal">
                                                                        {channel.count} outlet{channel.count > 1 ? "s" : ""}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {isAggregator ? (
                                                                channel.outlets.map((outlet) => {
                                                                    const currentClientId = petpoojaSession?.platformSelection?.clientId ?? petpoojaSession?.platformSelection?.client_id;
                                                                    const currentMappedId = petpoojaSession?.platformSelection?.mappedResId ?? petpoojaSession?.platformSelection?.mapped_res_id;
                                                                    const isSelected = String(currentClientId) === String(channel.userId) &&
                                                                        String(currentMappedId) === String(outlet.mappedId);
                                                                    const triggerSuccess = outlet.lastTriggerState === "success" || outlet.lastTrigger?.responseCode === "SUCCESS";

                                                                    return (
                                                                        <DropdownMenuItem
                                                                            key={outlet.mappedId}
                                                                            onClick={() => handleSwitchPetpoojaPlatform({
                                                                                client_id: channel.userId,
                                                                                mapped_res_id: outlet.mappedId,
                                                                            })}
                                                                            className={`text-xs px-2.5 py-2 cursor-pointer rounded-lg flex items-center justify-between my-0.5 ${isSelected ? "bg-accent font-semibold" : ""}`}
                                                                        >
                                                                            <div className="min-w-0 flex-1 pr-2">
                                                                                <p className="truncate font-medium flex items-center gap-1.5">
                                                                                    {outlet.restaurantName || channel.name}
                                                                                    <span className="text-[9px] bg-muted px-1 rounded text-muted-foreground font-mono">
                                                                                        #{outlet.mappedId}
                                                                                    </span>
                                                                                </p>
                                                                                {outlet.lastTrigger?.createdAt && (
                                                                                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                                                                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${triggerSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                                                                        Last Synced: {new Date(outlet.lastTrigger.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                                    </p>
                                                                                )}
                                                                            </div>
                                                                            {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                                                                        </DropdownMenuItem>
                                                                    );
                                                                })
                                                            ) : (
                                                                <DropdownMenuItem
                                                                    onClick={() => handleSwitchPetpoojaPlatform({
                                                                        client_id: channel.userId,
                                                                        mapped_res_id: channel.userId,
                                                                    })}
                                                                    className="text-xs px-2.5 py-1.5 cursor-pointer rounded-lg flex items-center justify-between"
                                                                >
                                                                    <span className="font-medium text-xs">{channel.name}</span>
                                                                    <span className="text-[10px] text-muted-foreground">Select</span>
                                                                </DropdownMenuItem>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                /* Fallback if integrationOutlets not yet loaded */
                                                petpoojaSession?.platforms
                                                    ?.filter((plat) => {
                                                        const platName = (plat.name || plat.client_name || plat.platform || "").toLowerCase();
                                                        return platName.includes("zomato") || platName.includes("swiggy");
                                                    })
                                                    .sort((a, b) => {
                                                        const aZomato = (a.name || a.client_name || a.platform || "").toLowerCase().includes("zomato") ? 0 : 1;
                                                        const bZomato = (b.name || b.client_name || b.platform || "").toLowerCase().includes("zomato") ? 0 : 1;
                                                        return aZomato - bZomato;
                                                    })
                                                    .map((plat, idx) => {
                                                    const platName = plat.name || plat.client_name || plat.platform || `Platform ${plat.client_id}`;
                                                    const currentClientId = petpoojaSession?.platformSelection?.clientId ?? petpoojaSession?.platformSelection?.client_id;
                                                    const isSelected = String(currentClientId) === String(plat.client_id || plat.clientId);
                                                    return (
                                                        <DropdownMenuItem
                                                            key={plat.client_id || idx}
                                                            onClick={() => handleSwitchPetpoojaPlatform(plat)}
                                                            className={`text-xs px-2.5 py-2 cursor-pointer rounded-lg flex items-center justify-between ${isSelected ? "bg-accent font-semibold" : ""}`}
                                                        >
                                                            <span>{platName}</span>
                                                            {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                                                        </DropdownMenuItem>
                                                    );
                                                })
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}

                                {/* Image Upload Queue Progress Indicator */}
                                {uploadQueue && uploadQueue.total > 0 && (
                                    <div
                                        className={`h-8 px-2.5 sm:px-3 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all shrink-0 select-none ${
                                            uploadQueue.isProcessing
                                                ? "bg-blue-50/90 border-blue-200 text-blue-700 shadow-xs animate-in fade-in"
                                                : uploadQueue.failed > 0
                                                    ? "bg-amber-50 border-amber-200 text-amber-800"
                                                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                                        }`}
                                        title={
                                            uploadQueue.isProcessing
                                                ? `Uploading image ${uploadQueue.completed + 1} of ${uploadQueue.total}...`
                                                : `${uploadQueue.completed} of ${uploadQueue.total} uploaded${uploadQueue.failed > 0 ? `, ${uploadQueue.failed} failed` : ""}`
                                        }
                                    >
                                        {uploadQueue.isProcessing ? (
                                            <>
                                                <Loader2 size={13} className="animate-spin text-blue-600 shrink-0" />
                                                <span className="truncate max-w-[130px] sm:max-w-none">
                                                    Uploading ({uploadQueue.completed}/{uploadQueue.total})
                                                </span>
                                                <div className="w-10 sm:w-14 h-1.5 bg-blue-200/70 rounded-full overflow-hidden shrink-0">
                                                    <div
                                                        className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                                                        style={{
                                                            width: `${Math.max(8, Math.round(((uploadQueue.completed) / uploadQueue.total) * 100))}%`
                                                        }}
                                                    />
                                                </div>
                                            </>
                                        ) : uploadQueue.failed > 0 ? (
                                            <>
                                                <AlertCircle size={13} className="text-amber-600 shrink-0" />
                                                <span>
                                                    {uploadQueue.completed}/{uploadQueue.total} uploaded
                                                    <span className="text-red-600 ml-1">({uploadQueue.failed} failed)</span>
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                                <span>All {uploadQueue.total} uploaded</span>
                                            </>
                                        )}
                                    </div>
                                )}

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
                                    className="h-8 rounded-lg px-3 bg-[#e23744] hover:bg-[#cb202d] text-white border-transparent hover:text-white transition-colors text-xs font-semibold shrink-0"
                                >
                                    {isSyncing ? (
                                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <History className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Sync Menu
                                </Button>

                                {!isPetpooja && (
                                    <Button
                                        id="global-save-btn"
                                        onClick={onSave}
                                        disabled={isSaving || isLoading}
                                        className="h-8 rounded-lg px-3.5 shadow-sm text-xs font-semibold shrink-0"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="mr-1.5 h-3.5 w-3.5" />
                                                Save Changes
                                            </>
                                        )}
                                    </Button>
                                )}

                                {isPetpooja ? (
                                    <Popover open={isPetpoojaTriggerOpen} onOpenChange={setIsPetpoojaTriggerOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                disabled={isPetpoojaPublishing}
                                                className="h-10 rounded-lg px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md transition-all font-semibold flex items-center gap-2"
                                                title={`Trigger menu publish to ${petpoojaCurrentPlatformName}`}
                                            >
                                                {isPetpoojaPublishing ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="mr-2 h-4 w-4" />
                                                )}
                                                Trigger to {petpoojaCurrentPlatformName}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-84 p-4 shadow-xl border-border/80" align="end">
                                            <div className="grid gap-3">
                                                <div className="space-y-1">
                                                    <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
                                                        <Sparkles className="w-4 h-4 text-emerald-600" />
                                                        Publish Menu to Aggregator
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground">
                                                        Push menu updates directly from Petpooja to online platforms.
                                                    </p>
                                                </div>

                                                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-muted-foreground font-medium">Active Platform:</span>
                                                        <span className="font-bold flex items-center gap-1.5 text-foreground">
                                                            <span className={`w-2 h-2 rounded-full ${petpoojaCurrentPlatformName.toLowerCase().includes("zomato") ? "bg-red-500" : "bg-orange-500"}`} />
                                                            {petpoojaCurrentPlatformName}
                                                        </span>
                                                    </div>
                                                    {petpoojaCurrentOutlet && (
                                                        <>
                                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                                <span>Outlet:</span>
                                                                <span className="font-medium text-foreground">
                                                                    {petpoojaCurrentOutlet.restaurantName || resId}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                                <span>Mapped ID:</span>
                                                                <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                                                    #{petpoojaCurrentOutlet.mappedId}
                                                                </span>
                                                            </div>
                                                            {petpoojaCurrentOutlet.lastTrigger?.createdAt && (
                                                                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5 border-t border-slate-200/60">
                                                                    <span>Last Published:</span>
                                                                    <span className="font-medium">
                                                                        {new Date(petpoojaCurrentOutlet.lastTrigger.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="space-y-1.5 pt-0.5">
                                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                                        Publish Scope
                                                    </label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTriggerPlatform("current")}
                                                            className={`py-1.5 px-2 text-xs rounded-lg border font-medium transition-all text-center ${
                                                                selectedTriggerPlatform === "current"
                                                                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                                                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            {petpoojaCurrentPlatformName} Only
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTriggerPlatform("all")}
                                                            className={`py-1.5 px-2 text-xs rounded-lg border font-medium transition-all text-center ${
                                                                selectedTriggerPlatform === "all"
                                                                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-xs"
                                                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                            }`}
                                                        >
                                                            Both (Zomato & Swiggy)
                                                        </button>
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={handleTriggerPetpoojaPublish}
                                                    disabled={isPetpoojaPublishing}
                                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm mt-1"
                                                >
                                                    {isPetpoojaPublishing ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Publishing...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="mr-2 h-4 w-4" />
                                                            Confirm & Publish to {selectedTriggerPlatform === "all" ? "All Platforms" : petpoojaCurrentPlatformName}
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                ) : (
                                    <Popover open={isTriggerPopoverOpen} onOpenChange={setIsTriggerPopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                disabled={isTriggering}
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
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80" align="end">
                                            <div className="grid gap-4">
                                                {activeSyncProgress && (activeSyncProgress.status === 'pending' || activeSyncProgress.status === 'processing') && (
                                                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                                                        <span className="leading-tight">A sync is currently running ({activeSyncProgress.completed + activeSyncProgress.failed}/{activeSyncProgress.total}). You can retrigger or dismiss.</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveSyncProgress(null)}
                                                            className="ml-2 text-[11px] font-bold text-amber-800 underline hover:text-amber-950 shrink-0"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                )}
                                                {/* {zomatoHasAddons && (
                                                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-950 text-xs flex flex-col gap-2">
                                                        <div className="flex items-start gap-2">
                                                            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                                            <div>
                                                                <p className="font-semibold text-red-900">Addons Not Allowed (Zomato)</p>
                                                                <p className="mt-0.5 text-[11px] text-red-800 leading-snug">
                                                                    {zomatoItemsWithAddons.length > 0
                                                                        ? `${zomatoItemsWithAddons.length} item(s) currently have addons attached. Zomato does not allow triggering with addons.`
                                                                        : "Addon groups exist on this menu. You must delete all addons before triggering Zomato."}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            type="button"
                                                            onClick={() => {
                                                                if (deleteAllAddons) {
                                                                    deleteAllAddons();
                                                                    notify.success("All addons removed. Click 'Save Changes' to save.");
                                                                }
                                                            }}
                                                            className="w-full h-7 text-xs border-red-300 text-red-900 bg-red-100/60 hover:bg-red-100 hover:text-red-950 font-medium"
                                                        >
                                                            Delete All Addons Now
                                                        </Button>
                                                    </div>
                                                )} */}

                                                {isWhitelistedRes ? (
                                                    <div className="space-y-4">
                                                        <div className="space-y-2">
                                                            <h4 className="font-medium leading-none">Trigger Menu</h4>
                                                            <p className="text-sm text-muted-foreground">
                                                                This restaurant is whitelisted. You can trigger the menu directly.
                                                            </p>
                                                        </div>
                                                        <Button onClick={() => handleTriggerMenu(true)} disabled={isTriggering} className="w-full">
                                                            {isTriggering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                                            Confirm Trigger
                                                        </Button>
                                                    </div>
                                                ) : isOtpVerified ? (
                                                    <div className="space-y-4">
                                                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex flex-col gap-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                                                <span className="font-bold text-emerald-950">Restaurant Unlocked via Admin OTP</span>
                                                            </div>
                                                            <p className="text-[11px] text-emerald-800 leading-snug">
                                                                Authorized for {activeResName} ({resId}). You can proceed with menu trigger.
                                                            </p>
                                                        </div>
                                                        <Button
                                                            onClick={() => handleTriggerMenu(true)}
                                                            disabled={isTriggering}
                                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                                        >
                                                            {isTriggering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                                            Confirm Trigger
                                                        </Button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsOtpVerified(false);
                                                                localStorage.removeItem(`otp_verified_${resId}`);
                                                            }}
                                                            className="text-[10px] text-muted-foreground hover:text-foreground text-center w-full underline"
                                                        >
                                                            Re-lock restaurant
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="space-y-1">
                                                            <h4 className="font-semibold text-sm flex items-center justify-between">
                                                                <span>Trigger Menu</span>
                                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-300">
                                                                    🔒 Locked Outlet
                                                                </span>
                                                            </h4>
                                                            <p className="text-xs text-muted-foreground">
                                                                Enter CRM Task ID or verify using Admin OTP to unlock triggering.
                                                            </p>
                                                        </div>

                                                        {/* Tab Switcher: Task ID vs Admin OTP */}
                                                        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                                                            <button
                                                                type="button"
                                                                onClick={() => setAuthMode("task")}
                                                                className={`py-1 text-xs font-semibold rounded-md transition-all ${authMode === "task" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
                                                            >
                                                                Task ID
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setAuthMode("otp")}
                                                                className={`py-1 text-xs font-semibold rounded-md transition-all ${authMode === "otp" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"}`}
                                                            >
                                                                Admin OTP
                                                            </button>
                                                        </div>

                                                        {authMode === "task" ? (
                                                            <div className="space-y-2.5">
                                                                <div className="grid gap-1.5">
                                                                    <Label htmlFor="taskId" className="text-xs">Task ID <span className="text-destructive">*</span></Label>
                                                                    <Input
                                                                        id="taskId"
                                                                        placeholder="Enter CRM Task ID"
                                                                        value={triggerTaskId}
                                                                        onChange={(e) => setTriggerTaskId(e.target.value)}
                                                                        required
                                                                        className="text-xs h-8"
                                                                    />
                                                                </div>
                                                                {!dbTaskId ? (
                                                                    <Button onClick={handleSaveTaskId} disabled={!triggerTaskId.trim() || isSavingTaskId} className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700">
                                                                        {isSavingTaskId ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                                                                        Save & Validate Task ID
                                                                    </Button>
                                                                ) : (
                                                                    <Button onClick={() => handleTriggerMenu(false)} disabled={isTriggering} className="w-full h-8 text-xs">
                                                                        {isTriggering ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                                                                        Confirm Trigger
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2.5">
                                                                <div className="p-2.5 rounded-lg bg-purple-50/80 border border-purple-200 text-purple-950 text-[11px] leading-relaxed">
                                                                    OTP will be emailed to:
                                                                    <div className="font-semibold text-purple-900 mt-0.5 truncate text-[11px]">
                                                                        vishalkushwaha@magicscale.in
                                                                    </div>
                                                                </div>

                                                                {!otpSent ? (
                                                                    <Button
                                                                        type="button"
                                                                        onClick={handleSendOtp}
                                                                        disabled={isSendingOtp}
                                                                        className="w-full h-9 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
                                                                    >
                                                                        {isSendingOtp ? (
                                                                            <>
                                                                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                                                                Sending OTP...
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Mail className="mr-2 h-3.5 w-3.5" />
                                                                                Send OTP
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                ) : (
                                                                    <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                                                                        <div className="grid gap-1">
                                                                            <Label htmlFor="otpCode" className="text-xs">Enter 6-Digit OTP</Label>
                                                                            <Input
                                                                                id="otpCode"
                                                                                placeholder="000000"
                                                                                maxLength={6}
                                                                                value={otpInput}
                                                                                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                                                                                className="text-center font-mono tracking-widest text-base font-bold h-9"
                                                                                autoFocus
                                                                            />
                                                                        </div>
                                                                        <div className="flex gap-2">
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                onClick={handleSendOtp}
                                                                                disabled={isSendingOtp}
                                                                                className="flex-1 h-8 text-xs"
                                                                            >
                                                                                {isSendingOtp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                                                                Resend
                                                                            </Button>
                                                                            <Button
                                                                                type="button"
                                                                                onClick={handleVerifyOtp}
                                                                                disabled={otpInput.length < 6 || isVerifyingOtp}
                                                                                className="flex-1 h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                                                                            >
                                                                                {isVerifyingOtp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                                                                Verify OTP
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}

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
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono">{activeSyncProgress.completed + activeSyncProgress.failed}/{activeSyncProgress.total}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveSyncProgress(null)}
                                                    className="text-gray-400 hover:text-gray-700 p-0.5 rounded cursor-pointer"
                                                    title="Dismiss sync indicator"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden z-0 shadow-inner">
                                            <div
                                                className={`h-1.5 rounded-full ${activeSyncProgress.failed > 0 ? 'bg-orange-500' : 'bg-green-500'} transition-all duration-300 ease-out`}
                                                style={{ width: `${activeSyncProgress.total > 0 ? ((activeSyncProgress.completed + activeSyncProgress.failed) / activeSyncProgress.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {(isSwiggy || isOwnly) && (
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