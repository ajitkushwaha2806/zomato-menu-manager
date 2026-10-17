"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    RefreshCw,
    Database,
    CheckCircle2,
    XCircle,
    Play,
    Pause,
    Square,
    Sparkles,
    Image as ImageIcon,
    Layers,
    Search,
    ChevronRight,
} from "lucide-react";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import usePetpoojaRestaurant from "@/store/hooks/usePetpoojaRestaurant";
import api from "@/lib/api/axios";

export default function SyncAllRestaurantsModal({ isOpen, onClose }) {
    const { restaurants: zomatoRestaurants, isLoading: isZomatoLoading } = useRestaurant();
    const { restaurants: swiggyRestaurants } = useSwiggyRestaurant();
    const { restaurants: petpoojaRestaurants } = usePetpoojaRestaurant();

    const [platform, setPlatform] = useState("zomato");
    const [skipAlreadySynced, setSkipAlreadySynced] = useState(true);
    const [concurrency, setConcurrency] = useState(3);
    const [searchQuery, setSearchQuery] = useState("");

    // Existing sync status from database
    const [dbStatus, setDbStatus] = useState({
        totalRestaurantsInDb: 0,
        totalItems: 0,
        totalImages: 0,
        restaurants: [],
    });
    const [isLoadingDbStatus, setIsLoadingDbStatus] = useState(false);

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(false);
    const stopSignalRef = useRef(false);

    const [currentResName, setCurrentResName] = useState("");
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [stats, setStats] = useState({
        synced: 0,
        skipped: 0,
        failed: 0,
        itemsFound: 0,
        imagesFound: 0,
    });
    const [logs, setLogs] = useState([]);
    const logsEndRef = useRef(null);

    // Load DB status whenever modal opens
    const loadDbStatus = async () => {
        try {
            setIsLoadingDbStatus(true);
            const { data } = await api.get("/api/menu/sync-status");
            if (data?.success) {
                setDbStatus(data);
            }
        } catch (err) {
            console.error("Failed to load DB sync status:", err);
        } finally {
            setIsLoadingDbStatus(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadDbStatus();
        } else {
            // If modal closed, don't stop syncing in background, but keep state clean
        }
    }, [isOpen]);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    // Active connected restaurants for current platform
    const targetRestaurants = useMemo(() => {
        let list = [];
        if (platform === "zomato") {
            list = zomatoRestaurants?.entities || [];
        } else if (platform === "swiggy") {
            list = swiggyRestaurants?.entities || [];
        } else if (platform === "petpooja") {
            list = petpoojaRestaurants?.entities || [];
        }
        return list.map((r) => ({
            id: String(r.id || r.resId),
            name: r.name || `Restaurant (${r.id || r.resId})`,
            subzone: r.subzone || "",
            thumbnail: r.thumbnail || "",
        }));
    }, [platform, zomatoRestaurants, swiggyRestaurants, petpoojaRestaurants]);

    const syncedResIdSet = useMemo(() => {
        const set = new Set();
        (dbStatus.restaurants || []).forEach((r) => {
            if (r.platform === platform && r.itemsCount > 0) {
                set.add(String(r.resId));
            }
        });
        return set;
    }, [dbStatus, platform]);

    const filteredRestaurants = useMemo(() => {
        if (!searchQuery.trim()) return targetRestaurants;
        const q = searchQuery.toLowerCase().trim();
        return targetRestaurants.filter(
            (r) => r.name.toLowerCase().includes(q) || r.id.includes(q)
        );
    }, [targetRestaurants, searchQuery]);

    const addLog = (type, message) => {
        const time = new Date().toLocaleTimeString();
        setLogs((prev) => [
            ...prev.slice(-150),
            { id: Math.random().toString(), time, type, message },
        ]);
    };

    const handleStartSync = async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setIsPaused(false);
        isPausedRef.current = false;
        stopSignalRef.current = false;

        // Filter list based on skipAlreadySynced option
        let queue = [...targetRestaurants];
        let initialSkipped = 0;

        if (skipAlreadySynced) {
            const pending = queue.filter((r) => !syncedResIdSet.has(String(r.id)));
            initialSkipped = queue.length - pending.length;
            queue = pending;
        }

        setProgress({ current: initialSkipped, total: targetRestaurants.length });
        setStats({
            synced: 0,
            skipped: initialSkipped,
            failed: 0,
            itemsFound: 0,
            imagesFound: 0,
        });

        addLog(
            "info",
            `Starting sync for ${queue.length} ${platform.toUpperCase()} restaurants (${initialSkipped} already synced)...`
        );

        let currentIndex = 0;
        let syncedCount = 0;
        let failedCount = 0;
        let totalItems = 0;
        let totalImages = 0;

        const worker = async () => {
            while (currentIndex < queue.length) {
                if (stopSignalRef.current) break;

                // Handle pause
                while (isPausedRef.current && !stopSignalRef.current) {
                    await new Promise((r) => setTimeout(r, 500));
                }
                if (stopSignalRef.current) break;

                const itemIndex = currentIndex++;
                const restaurant = queue[itemIndex];
                if (!restaurant) break;

                setCurrentResName(restaurant.name);

                try {
                    let endpoint = "";
                    if (platform === "zomato") {
                        endpoint = `/api/menu/${restaurant.id}/zomato/import`;
                    } else if (platform === "swiggy") {
                        endpoint = `/api/menu/${restaurant.id}/swiggy/import`;
                    } else {
                        endpoint = `/api/menu/${restaurant.id}/petpooja/import`;
                    }

                    const res = await api.get(endpoint, {
                        params: { name: restaurant.name },
                        timeout: 35000,
                    });

                    if (res.data?.success) {
                        const items = res.data.total_items ?? res.data.stats?.items ?? 0;
                        const images = res.data.stats?.totalImagesFound ?? 0;

                        syncedCount++;
                        totalItems += items;
                        totalImages += images;

                        addLog(
                            "success",
                            `✓ Synced "${restaurant.name}" (${restaurant.id}) — ${items} items, ${images} images`
                        );
                    } else {
                        failedCount++;
                        addLog(
                            "warn",
                            `⚠ Empty/Issue for "${restaurant.name}" (${restaurant.id}): ${res.data?.message || "No items"}`
                        );
                    }
                } catch (err) {
                    failedCount++;
                    addLog(
                        "error",
                        `✕ Failed "${restaurant.name}" (${restaurant.id}): ${err?.response?.data?.message || err.message}`
                    );
                }

                setStats((prev) => ({
                    ...prev,
                    synced: syncedCount,
                    failed: failedCount,
                    itemsFound: totalItems,
                    imagesFound: totalImages,
                }));

                setProgress((prev) => ({
                    ...prev,
                    current: initialSkipped + syncedCount + failedCount,
                }));

                // Polite delay to prevent rate limits
                await new Promise((r) => setTimeout(r, 600));
            }
        };

        const workers = [];
        const actualConcurrency = Math.max(1, Math.min(concurrency, 5));
        for (let i = 0; i < actualConcurrency; i++) {
            workers.push(worker());
        }

        await Promise.all(workers);

        setIsSyncing(false);
        setCurrentResName("");
        if (stopSignalRef.current) {
            addLog("warn", "Sync cancelled by user.");
        } else {
            addLog(
                "success",
                `🎉 Sync Completed! Synced ${syncedCount} restaurants with ${totalItems} items and ${totalImages} images.`
            );
        }

        // Refresh DB status
        loadDbStatus();
    };

    const handlePauseToggle = () => {
        isPausedRef.current = !isPausedRef.current;
        setIsPaused(isPausedRef.current);
    };

    const handleStop = () => {
        stopSignalRef.current = true;
        isPausedRef.current = false;
        setIsPaused(false);
    };

    const percentage = useMemo(() => {
        if (!progress.total) return 0;
        return Math.min(100, Math.round((progress.current / progress.total) * 100));
    }, [progress]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isSyncing && onClose && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-white rounded-2xl shadow-2xl border border-gray-100">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 relative">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
                                <Database className="w-6 h-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                                    Sync Connected Restaurants to Database
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-medium">
                                        Multi-Menu Cache
                                    </span>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-slate-300 mt-1">
                                    Pulls menus & dishes from all connected accounts into your MongoDB database so
                                    <strong> Auto Apply Images</strong> can instantly find exact 100% photo matches.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Overall DB Stat Pills */}
                    <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
                        <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Restaurants in DB</span>
                            <span className="text-lg font-bold text-white flex items-center gap-1.5 mt-0.5">
                                <Layers className="w-4 h-4 text-indigo-400" />
                                {dbStatus.totalRestaurantsInDb} / {targetRestaurants.length}
                            </span>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Cached Dishes</span>
                            <span className="text-lg font-bold text-white flex items-center gap-1.5 mt-0.5">
                                <Sparkles className="w-4 h-4 text-emerald-400" />
                                {dbStatus.totalItems?.toLocaleString() || 0}
                            </span>
                        </div>
                        <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Images Ready</span>
                            <span className="text-lg font-bold text-white flex items-center gap-1.5 mt-0.5">
                                <ImageIcon className="w-4 h-4 text-sky-400" />
                                {dbStatus.totalImages?.toLocaleString() || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1">
                    {/* Controls Row */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-slate-700">Platform:</span>
                            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-xs">
                                <button
                                    onClick={() => !isSyncing && setPlatform("zomato")}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        platform === "zomato"
                                            ? "bg-red-500 text-white shadow-xs"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    Zomato ({zomatoRestaurants?.entities?.length || 0})
                                </button>
                                <button
                                    onClick={() => !isSyncing && setPlatform("swiggy")}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        platform === "swiggy"
                                            ? "bg-orange-500 text-white shadow-xs"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    Swiggy ({swiggyRestaurants?.entities?.length || 0})
                                </button>
                                <button
                                    onClick={() => !isSyncing && setPlatform("petpooja")}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                        platform === "petpooja"
                                            ? "bg-emerald-600 text-white shadow-xs"
                                            : "text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    Petpooja ({petpoojaRestaurants?.entities?.length || 0})
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 select-none">
                                <input
                                    type="checkbox"
                                    checked={skipAlreadySynced}
                                    onChange={(e) => setSkipAlreadySynced(e.target.checked)}
                                    disabled={isSyncing}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>Skip already synced ({syncedResIdSet.size})</span>
                            </label>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span>Concurrency:</span>
                                <select
                                    value={concurrency}
                                    onChange={(e) => setConcurrency(Number(e.target.value))}
                                    disabled={isSyncing}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                    <option value={1}>1 (Safe)</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3 (Fast, Recommended)</option>
                                    <option value={5}>5 (Maximum)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Progress Card when Syncing or Completed */}
                    {(isSyncing || progress.total > 0) && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-indigo-900">
                                        {isSyncing
                                            ? isPaused
                                                ? "Sync Paused"
                                                : "Syncing In Progress..."
                                            : "Sync Finished"}
                                    </span>
                                    {currentResName && isSyncing && !isPaused && (
                                        <span className="truncate max-w-[260px] text-indigo-700 font-medium animate-pulse">
                                            ({currentResName})
                                        </span>
                                    )}
                                </div>
                                <span className="font-mono font-bold text-indigo-800">
                                    {progress.current} / {progress.total} ({percentage}%)
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-indigo-100 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-300 ${
                                        percentage === 100
                                            ? "bg-green-500"
                                            : "bg-gradient-to-r from-indigo-500 to-indigo-600"
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>

                            {/* Live Stats */}
                            <div className="flex flex-wrap items-center gap-4 text-xs pt-1 text-slate-600">
                                <span>
                                    Synced: <strong className="text-emerald-700">{stats.synced}</strong>
                                </span>
                                <span>
                                    Skipped: <strong className="text-slate-600">{stats.skipped}</strong>
                                </span>
                                <span>
                                    Failed: <strong className="text-red-600">{stats.failed}</strong>
                                </span>
                                <span>
                                    Items: <strong className="text-indigo-700">{stats.itemsFound}</strong>
                                </span>
                                <span>
                                    Images Cached: <strong className="text-sky-700">{stats.imagesFound}</strong>
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Live Activity Log */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <span>Live Sync Activity</span>
                            {logs.length > 0 && (
                                <button
                                    onClick={() => setLogs([])}
                                    className="text-[11px] text-slate-400 hover:text-slate-600"
                                >
                                    Clear Logs
                                </button>
                            )}
                        </div>

                        <div className="h-40 bg-slate-950 text-slate-200 rounded-xl p-3 font-mono text-[11px] overflow-y-auto space-y-1 border border-slate-800">
                            {logs.length === 0 ? (
                                <div className="text-slate-500 text-center py-12">
                                    Click "Start Sync All" to begin syncing menus from {targetRestaurants.length} restaurants.
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className={`flex items-start gap-2 leading-tight ${
                                            log.type === "success"
                                                ? "text-emerald-400"
                                                : log.type === "error"
                                                ? "text-rose-400"
                                                : log.type === "warn"
                                                ? "text-amber-300"
                                                : "text-slate-300"
                                        }`}
                                    >
                                        <span className="text-slate-500 shrink-0">[{log.time}]</span>
                                        <span>{log.message}</span>
                                    </div>
                                ))
                            )}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        {targetRestaurants.length} restaurants connected |{" "}
                        {targetRestaurants.length - syncedResIdSet.size} not yet in DB
                    </div>

                    <div className="flex items-center gap-2">
                        {isSyncing ? (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handlePauseToggle}
                                    className="h-9 px-4 gap-1.5 font-bold"
                                >
                                    {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                                    <span>{isPaused ? "Resume" : "Pause"}</span>
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={handleStop}
                                    className="h-9 px-4 gap-1.5 font-bold"
                                >
                                    <Square className="w-3.5 h-3.5" />
                                    <span>Stop</span>
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onClose}
                                    className="h-9 px-4"
                                >
                                    Close
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleStartSync}
                                    disabled={targetRestaurants.length === 0}
                                    className="h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 shadow-sm"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    <span>Start Sync All</span>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
