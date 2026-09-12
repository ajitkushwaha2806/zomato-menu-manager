"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCcw, CheckCircle2, Clock, AlertCircle, FileJson, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import api from "@/lib/api/axios";
import useNotification from "@/store/hooks/useNotification";

const generateTempId = () => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
        return `temp-${window.crypto.randomUUID()}`;
    }
    return `temp-${Math.random().toString(36).substring(2, 11)}-${Date.now().toString(36)}`;
};

export const transformMenuAsNew = (updatedMenu) => {
    if (!updatedMenu) return { categories: [], sub_categories: [], items: [] };

    const categoryIdMap = new Map();
    const categoryNameMap = new Map();
    const subCategoryIdMap = new Map();
    const subCategoryNameMap = new Map();

    const originalCategories = updatedMenu.categories || [];
    const originalSubCategories = updatedMenu.sub_categories || [];
    const originalItems = updatedMenu.items || [];

    // 1. Transform Categories
    const categories = originalCategories.map((cat) => {
        const newCatId = generateTempId();
        if (cat.id) {
            categoryIdMap.set(String(cat.id), newCatId);
        }
        if (cat.name) {
            categoryNameMap.set(cat.name.trim().toLowerCase(), newCatId);
        }
        const { status, error, ...restCat } = cat;
        return {
            ...restCat,
            id: newCatId,
            action: "create",
        };
    });

    // 2. Transform SubCategories
    const sub_categories = originalSubCategories.map((sub) => {
        const newSubId = generateTempId();
        if (sub.id) {
            subCategoryIdMap.set(String(sub.id), newSubId);
        }
        if (sub.name) {
            subCategoryNameMap.set(sub.name.trim().toLowerCase(), newSubId);
        }

        let mappedCatId = sub.categoryId ? categoryIdMap.get(String(sub.categoryId)) : null;
        if (!mappedCatId && sub.categoryName) {
            mappedCatId = categoryNameMap.get(sub.categoryName.trim().toLowerCase());
        }
        if (!mappedCatId) {
            mappedCatId = (sub.categoryId && String(sub.categoryId).startsWith("temp-")) ? sub.categoryId : generateTempId();
        }

        const { status, error, ...restSub } = sub;
        return {
            ...restSub,
            id: newSubId,
            categoryId: mappedCatId,
            action: "create",
        };
    });

    // 3. Transform Items
    const items = originalItems.map((item) => {
        const newItemId = generateTempId();

        let mappedCatId = item.categoryId ? categoryIdMap.get(String(item.categoryId)) : null;
        if (!mappedCatId && item.categoryName) {
            mappedCatId = categoryNameMap.get(item.categoryName.trim().toLowerCase());
        }
        if (!mappedCatId && item.categoryId && String(item.categoryId).startsWith("temp-")) {
            mappedCatId = item.categoryId;
        }

        let mappedSubCatId = item.subCategoryId ? subCategoryIdMap.get(String(item.subCategoryId)) : null;
        if (!mappedSubCatId && item.subCategoryName) {
            mappedSubCatId = subCategoryNameMap.get(item.subCategoryName.trim().toLowerCase());
        }
        if (!mappedSubCatId && item.subCategoryId && String(item.subCategoryId).startsWith("temp-")) {
            mappedSubCatId = item.subCategoryId;
        }

        // Transform variants
        const transformedVariants = Array.isArray(item.variants)
            ? item.variants.map((vg) => {
                  const newPropId = generateTempId();
                  return {
                      ...vg,
                      id: newPropId,
                      property_id: newPropId,
                      status: undefined,
                      error: undefined,
                      options: Array.isArray(vg.options)
                          ? vg.options.map((opt) => {
                                const newOptId = generateTempId();
                                return {
                                    ...opt,
                                    id: newOptId,
                                    option_id: newOptId,
                                    status: undefined,
                                    error: undefined,
                                };
                            })
                          : [],
                  };
              })
            : item.variants;

        // Transform addon groups if present
        const transformedAddonGroups = Array.isArray(item.addonGroups || item.addon_groups)
            ? (item.addonGroups || item.addon_groups).map((ag) => {
                  const newAgId = generateTempId();
                  return {
                      ...ag,
                      id: newAgId,
                      group_id: newAgId,
                      status: undefined,
                      error: undefined,
                      options: Array.isArray(ag.options || ag.addons)
                          ? (ag.options || ag.addons).map((opt) => {
                                const newOptId = generateTempId();
                                return {
                                    ...opt,
                                    id: newOptId,
                                    addon_id: newOptId,
                                    status: undefined,
                                    error: undefined,
                                };
                            })
                          : [],
                  };
              })
            : (item.addonGroups || item.addon_groups);

        // Transform media
        const transformedMedia = Array.isArray(item.media)
            ? item.media.map((m) => {
                  if (typeof m === "object" && m !== null) {
                      return {
                          ...m,
                          tempReferenceId: generateTempId(),
                          id: undefined,
                      };
                  }
                  return m;
              })
            : item.media;

        const { status, error, ...restItem } = item;
        return {
            ...restItem,
            id: newItemId,
            ...(mappedCatId ? { categoryId: mappedCatId } : {}),
            ...(mappedSubCatId ? { subCategoryId: mappedSubCatId } : {}),
            ...(transformedVariants ? { variants: transformedVariants } : {}),
            ...(transformedAddonGroups ? { addonGroups: transformedAddonGroups } : {}),
            ...(transformedMedia ? { media: transformedMedia } : {}),
            action: "create",
        };
    });

    return {
        categories,
        sub_categories,
        items,
    };
};

const StatusBadge = ({ status }) => {
// ... existing code for StatusBadge ...
    switch (status) {
        case "completed":
            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold"><CheckCircle2 className="w-3 h-3" /> Completed</span>;
        case "processing":
            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold"><RefreshCcw className="w-3 h-3 animate-spin" /> Processing</span>;
        case "failed":
            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold"><AlertCircle className="w-3 h-3" /> Failed</span>;
        default:
            return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold"><Clock className="w-3 h-3" /> Pending</span>;
    }
};

const ActionTag = ({ action }) => {
    if (action === "create") {
        return <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Create</span>;
    }
    return <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold uppercase">Update</span>;
};

const SyncItem = ({ label, items, type }) => {
    const [expanded, setExpanded] = useState(false);
    
    if (!items || items.length === 0) return null;

    return (
        <div className="mt-2 border rounded-md overflow-hidden bg-gray-50/50">
            <button 
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="capitalize">{label}</span>
                    <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full text-xs">{items.length}</span>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            
            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t"
                    >
                        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
                            {items.map((item, idx) => (
                                <div key={idx} className={`bg-white p-2 rounded border shadow-sm flex flex-col gap-2 ${item.status === 'failed' ? 'border-red-200' : item.status === 'completed' ? 'border-green-200' : ''}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 max-w-[70%]">
                                            <span className="text-sm font-medium truncate" title={item.name}>{item.name || item.id}</span>
                                            {item.status && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                    item.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                    item.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {item.status.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <ActionTag action={item.action} />
                                    </div>
                                    
                                    {item.error && (
                                        <div className="text-xs bg-red-50 text-red-700 p-2 rounded border border-red-100 break-words">
                                            <strong>Error:</strong> {item.error}
                                        </div>
                                    )}
                                    
                                    <div className="bg-slate-900 rounded-md p-4 overflow-x-auto shadow-inner">
                                        <pre className="text-xs text-slate-300 font-mono leading-relaxed">
                                            {JSON.stringify(item, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const JobCard = ({ job, onRetry, onRetryFailed, onRetryAllAsNew, isRetrying }) => {
    const [expanded, setExpanded] = useState(false);
    
    const categories = job.updated_menu?.categories || [];
    const subCategories = job.updated_menu?.sub_categories || [];
    const items = job.updated_menu?.items || [];
    
    const totalChanges = categories.length + subCategories.length + items.length;

    const hasFailedItems = items.some(item => item.status === 'failed') || 
                           categories.some(cat => cat.status === 'failed') || 
                           subCategories.some(sub => sub.status === 'failed');

    return (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-3 transition-all hover:shadow-md">
            <div 
                className="p-4 cursor-pointer flex items-start justify-between"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <StatusBadge status={job.status} />
                        <span className="text-xs text-gray-400 font-medium">
                            {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 mt-1">
                        {totalChanges} Entity Changes
                    </p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {job._id}</p>
                </div>
                <div className="flex items-center gap-2">
                    {hasFailedItems && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetryFailed(job);
                            }}
                            disabled={isRetrying}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
                            title="Retry only failed items"
                        >
                            <RefreshCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                            Retry Failed
                        </button>
                    )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRetry(job);
                        }}
                        disabled={isRetrying}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
                        title="Retry all changes with existing IDs"
                    >
                        <RefreshCcw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                        Retry All
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onRetryAllAsNew(job);
                        }}
                        disabled={isRetrying}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 transition-colors disabled:opacity-50 shadow-sm border border-purple-200/60"
                        title="Regenerate all IDs as temp- and upload menu as new"
                    >
                        <Sparkles className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                        Retry All as New
                    </button>
                    <div className="text-gray-400 ml-1">
                        {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t bg-gray-50/30"
                    >
                        <div className="p-4">
                            {job.error && (
                                <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
                                    <span className="font-semibold block mb-1">Error Details:</span>
                                    {job.error}
                                </div>
                            )}
                            
                            <SyncItem label="Categories" items={categories} />
                            <SyncItem label="Sub Categories" items={subCategories} />
                            <SyncItem label="Items" items={items} />

                            {totalChanges === 0 && (
                                <div className="text-center py-4 text-sm text-gray-500">
                                    No entity changes found in payload.
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function SyncHistoryPanel({ isOpen, onClose, resId }) {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [retryingId, setRetryingId] = useState(null);
    const notify = useNotification();

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const { data } = await api.get(`/api/menu/${resId}/swiggy/sync-history`);
            if (data.success) {
                setJobs(data.data);
            }
        } catch (error) {
            console.error("Failed to fetch sync history", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async (job) => {
        try {
            setRetryingId(job._id);
            const payload = { updated_menu: job.updated_menu || { categories: [], sub_categories: [], items: [] } };
            const res = await api.post(`/api/menu/${resId}/swiggy/queue-changes`, payload);
            if (res.data?.success) {
                notify.success("Menu changes queued for retry successfully!");
                fetchHistory(); // refresh the list
            } else {
                notify.error(res.data?.message || "Failed to retry sync job.");
            }
        } catch (error) {
            console.error("Failed to retry job", error);
            notify.error("Failed to retry sync job.");
        } finally {
            setRetryingId(null);
        }
    };

    const handleRetryFailed = async (job) => {
        try {
            setRetryingId(job._id);
            const failedCategories = (job.updated_menu?.categories || []).filter(c => c.status === "failed").map(cat => ({ ...cat, status: undefined, error: undefined }));
            const failedSubCategories = (job.updated_menu?.sub_categories || []).filter(s => s.status === "failed").map(sub => ({ ...sub, status: undefined, error: undefined }));
            const failedItems = (job.updated_menu?.items || []).filter(i => i.status === "failed").map(item => ({ ...item, status: undefined, error: undefined }));

            const payload = {
                updated_menu: {
                    categories: failedCategories,
                    sub_categories: failedSubCategories,
                    items: failedItems
                }
            };

            const res = await api.post(`/api/menu/${resId}/swiggy/queue-changes`, payload);
            if (res.data?.success) {
                notify.success("Failed changes queued for retry successfully!");
                fetchHistory(); // refresh the list
            } else {
                notify.error(res.data?.message || "Failed to retry sync job.");
            }
        } catch (error) {
            console.error("Failed to retry failed items", error);
            notify.error("Failed to retry sync job.");
        } finally {
            setRetryingId(null);
        }
    };

    const handleRetryAllAsNew = async (job) => {
        try {
            setRetryingId(job._id);
            const transformedMenu = transformMenuAsNew(job.updated_menu);
            const payload = { updated_menu: transformedMenu };
            const res = await api.post(`/api/menu/${resId}/swiggy/queue-changes`, payload);
            if (res.data?.success) {
                notify.success("All items queued for retry as new entities!");
                fetchHistory(); // refresh the list
            } else {
                notify.error(res.data?.message || "Failed to retry sync job as new.");
            }
        } catch (error) {
            console.error("Failed to retry job as new", error);
            notify.error("Failed to retry sync job as new.");
        } finally {
            setRetryingId(null);
        }
    };

    useEffect(() => {
        if (isOpen && resId) {
            fetchHistory();
            
            // Poll every 5 seconds while open to get real-time updates
            const interval = setInterval(fetchHistory, 5000);
            return () => clearInterval(interval);
        }
    }, [isOpen, resId]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
                    />
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 h-full w-full sm:w-[90vw] lg:w-[85vw] max-w-7xl bg-gray-50 shadow-2xl z-50 flex flex-col border-l border-gray-200"
                    >
                        <div className="flex items-center justify-between p-4 bg-white border-b">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <FileJson className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="font-bold text-gray-900">Sync Queue History</h2>
                                    <p className="text-xs text-gray-500">Monitor Swiggy menu sync jobs</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={fetchHistory}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                    title="Refresh"
                                >
                                    <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
                            {loading && jobs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                                    <RefreshCcw className="w-8 h-8 animate-spin" />
                                    <p className="text-sm font-medium">Loading sync history...</p>
                                </div>
                            ) : jobs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3">
                                    <FileJson className="w-12 h-12 opacity-20" />
                                    <p className="text-sm font-medium">No sync jobs found for this restaurant.</p>
                                </div>
                            ) : (
                                <div>
                                    {jobs.map((job) => (
                                        <JobCard 
                                            key={job._id} 
                                            job={job} 
                                            onRetry={handleRetry}
                                            onRetryFailed={handleRetryFailed}
                                            onRetryAllAsNew={handleRetryAllAsNew}
                                            isRetrying={retryingId === job._id}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
