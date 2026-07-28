"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCcw, CheckCircle2, Clock, AlertCircle, FileJson, ChevronDown, ChevronUp } from "lucide-react";
import api from "@/lib/api/axios";

const StatusBadge = ({ status }) => {
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

const JobCard = ({ job }) => {
    const [expanded, setExpanded] = useState(false);
    
    const categories = job.updated_menu?.categories || [];
    const subCategories = job.updated_menu?.sub_categories || [];
    const items = job.updated_menu?.items || [];
    
    const totalChanges = categories.length + subCategories.length + items.length;

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
                <div className="text-gray-400">
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                                        <JobCard key={job._id} job={job} />
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
