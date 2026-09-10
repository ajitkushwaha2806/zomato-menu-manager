"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    PlayCircle,
    AlertCircle,
    Clock,
    FileText,
    Loader2,
    PlusCircle,
    Eye,
    CheckCircle2,
    RotateCw,
    Search,
    Trash2,
    Copy,
    Check,
    Layers,
    Utensils,
    Store,
    ArrowRight,
    Building2,
    ChevronRight,
    Edit3
} from "lucide-react";
import { toast } from "sonner";
import { MenuService } from "@/services/menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { useSelector } from "react-redux";
import useRestaurant from "@/store/hooks/useRestaurant";
import useSwiggyRestaurant from "@/store/hooks/useSwiggyRestaurant";
import usePetpoojaRestaurant from "@/store/hooks/usePetpoojaRestaurant";

export default function JobsTable() {
    const activeResId = useSelector((state) => state.menu?.activeResId);
    const activePlatform = useSelector((state) => state.menu?.activePlatform);

    // Fetch user restaurants from all platforms
    const { restaurants: zomatoRestaurants = [] } = useRestaurant();
    const { restaurants: swiggyRestaurants = [] } = useSwiggyRestaurant();
    const { restaurants: petpoojaRestaurants = [] } = usePetpoojaRestaurant();

    const [jobs, setJobs] = useState([]);
    const [stats, setStats] = useState({ total: 0, completed: 0, processing: 0, failed: 0 });
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("all"); // 'all', 'completed', 'processing', 'failed'
    const [searchQuery, setSearchQuery] = useState("");
    const [resumingId, setResumingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    // Append Modal State
    const [appendModalJob, setAppendModalJob] = useState(null);
    const [targetResId, setTargetResId] = useState("");
    const [targetPlatform, setTargetPlatform] = useState("zomato");
    const [targetResName, setTargetResName] = useState("");
    const [restaurantSearch, setRestaurantSearch] = useState("");
    const [selectedPlatformTab, setSelectedPlatformTab] = useState("all");
    const [isAppending, setIsAppending] = useState(false);

    // Preview Modal State
    const [previewJob, setPreviewJob] = useState(null);

    // Combine and normalize all restaurants
    const allRestaurants = useMemo(() => {
        const list = [];
        if (Array.isArray(zomatoRestaurants)) {
            zomatoRestaurants.forEach((r) => {
                list.push({
                    resId: String(r.resId || r.id || ""),
                    name: r.name || `Zomato Restaurant (${r.resId})`,
                    platform: "zomato",
                    thumbnail: r.thumbnail || null,
                    location: r.location || "",
                });
            });
        }
        if (Array.isArray(swiggyRestaurants)) {
            swiggyRestaurants.forEach((r) => {
                list.push({
                    resId: String(r.resId || r.id || ""),
                    name: r.name || `Swiggy Restaurant (${r.resId})`,
                    platform: "swiggy",
                    thumbnail: r.thumbnail || null,
                    location: r.location || "",
                });
            });
        }
        if (Array.isArray(petpoojaRestaurants)) {
            petpoojaRestaurants.forEach((r) => {
                list.push({
                    resId: String(r.resId || r.id || r.restID || ""),
                    name: r.name || r.restName || `Petpooja Restaurant (${r.resId})`,
                    platform: "petpooja",
                    thumbnail: r.thumbnail || null,
                    location: r.location || "",
                });
            });
        }
        return list;
    }, [zomatoRestaurants, swiggyRestaurants, petpoojaRestaurants]);

    // Filtered restaurants for the selector
    const filteredRestaurants = useMemo(() => {
        let list = allRestaurants;
        if (selectedPlatformTab !== "all") {
            list = list.filter((r) => r.platform === selectedPlatformTab);
        }
        if (restaurantSearch.trim()) {
            const q = restaurantSearch.toLowerCase().trim();
            list = list.filter(
                (r) =>
                    r.name?.toLowerCase().includes(q) ||
                    r.resId?.toLowerCase().includes(q) ||
                    r.location?.toLowerCase().includes(q)
            );
        }
        return list;
    }, [allRestaurants, selectedPlatformTab, restaurantSearch]);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const res = await MenuService.getAllJobs({
                status: activeTab !== "all" ? activeTab : "",
                search: searchQuery.trim(),
            });
            if (res?.success) {
                setJobs(res.data || []);
                if (res.stats) {
                    setStats(res.stats);
                }
            }
        } catch (error) {
            toast.error(error.message || "Failed to load queues");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, [activeTab]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchJobs();
    };

    const handleCopyId = (id) => {
        navigator.clipboard.writeText(id);
        setCopiedId(id);
        toast.success("Job ID copied to clipboard!");
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleResume = async (jobId) => {
        setResumingId(jobId);
        try {
            await MenuService.resumeJob(jobId);
            toast.success("Job resumed successfully!");
            fetchJobs();
        } catch (error) {
            toast.error(error.message || "Failed to resume job");
        } finally {
            setResumingId(null);
        }
    };

    const handleDelete = async (jobId) => {
        if (!window.confirm("Are you sure you want to delete this queue job?")) return;
        setDeletingId(jobId);
        try {
            await MenuService.deleteJob(jobId);
            toast.success("Job deleted successfully!");
            setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
        } catch (error) {
            toast.error(error.message || "Failed to delete job");
        } finally {
            setDeletingId(null);
        }
    };

    const openAppendModal = (job) => {
        setAppendModalJob(job);
        const defaultRes = job.restaurant_id || activeResId || "";
        setTargetResId(defaultRes);
        setTargetPlatform(job.platform || activePlatform || "zomato");
        
        // Find if we have a restaurant name for this resId
        const match = allRestaurants.find((r) => r.resId === defaultRes);
        setTargetResName(match ? match.name : "");
        setRestaurantSearch("");
        setSelectedPlatformTab("all");
    };

    const selectRestaurant = (restaurant) => {
        setTargetResId(restaurant.resId);
        setTargetPlatform(restaurant.platform || "zomato");
        setTargetResName(restaurant.name || "");
    };

    const handleExecuteAppend = async () => {
        if (!appendModalJob) return;
        if (!targetResId.trim()) {
            toast.error("Please specify a target restaurant ID");
            return;
        }

        setIsAppending(true);
        try {
            const res = await MenuService.appendJobToMenu(appendModalJob.job_id, {
                targetResId: targetResId.trim(),
                platform: targetPlatform,
            });

            if (res.success) {
                toast.success(
                    res.message || `Successfully appended menu items to restaurant ${targetResId}!`,
                    { duration: 6000 }
                );
                setAppendModalJob(null);
            } else {
                toast.error(res.message || "Failed to append menu");
            }
        } catch (error) {
            toast.error(error.message || "Failed to append menu items");
        } finally {
            setIsAppending(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "N/A";
        const date = new Date(dateStr);
        return date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getStatusBadge = (status) => {
        const s = (status || "").toLowerCase();
        switch (s) {
            case "completed":
                return (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Completed
                    </Badge>
                );
            case "processing":
                return (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 flex items-center gap-1 font-semibold animate-pulse">
                        <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                        Processing
                    </Badge>
                );
            case "queued":
                return (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 flex items-center gap-1 font-semibold">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Queued
                    </Badge>
                );
            case "failed":
                return (
                    <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 flex items-center gap-1 font-semibold">
                        <AlertCircle className="w-3 h-3 text-red-600" />
                        Failed
                    </Badge>
                );
            default:
                return <Badge variant="outline">{status || "Unknown"}</Badge>;
        }
    };

    const previewCategories = useMemo(() => {
        if (!previewJob?.chain_outputs) return [];
        const co = previewJob.chain_outputs;
        if (co.normalized_menu?.category) {
            return co.normalized_menu.category;
        }
        if (co.merged_items?.items) {
            const map = {};
            co.merged_items.items.forEach((item) => {
                const cat = item.category || "General";
                if (!map[cat]) map[cat] = { name: cat, sub_category: [{ name: item.sub_category || cat, items: [] }] };
                map[cat].sub_category[0].items.push(item);
            });
            return Object.values(map);
        }
        return [];
    }, [previewJob]);

    return (
        <div className="space-y-6">
            {/* Top Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div
                    onClick={() => setActiveTab("all")}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        activeTab === "all"
                            ? "bg-slate-900 text-white shadow-md border-slate-800"
                            : "bg-white hover:border-slate-300 text-slate-900"
                    }`}
                >
                    <p className={`text-xs font-semibold ${activeTab === "all" ? "text-slate-300" : "text-muted-foreground"}`}>
                        Total Queues
                    </p>
                    <p className="text-2xl font-black mt-1">{stats.total || jobs.length}</p>
                </div>

                <div
                    onClick={() => setActiveTab("completed")}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        activeTab === "completed"
                            ? "bg-emerald-600 text-white shadow-md border-emerald-700"
                            : "bg-white hover:border-emerald-300 text-slate-900"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className={`text-xs font-semibold ${activeTab === "completed" ? "text-emerald-100" : "text-emerald-600"}`}>
                            Completed
                        </p>
                        <CheckCircle2 className={`w-4 h-4 ${activeTab === "completed" ? "text-white" : "text-emerald-500"}`} />
                    </div>
                    <p className="text-2xl font-black mt-1">{stats.completed}</p>
                </div>

                <div
                    onClick={() => setActiveTab("processing")}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        activeTab === "processing"
                            ? "bg-blue-600 text-white shadow-md border-blue-700"
                            : "bg-white hover:border-blue-300 text-slate-900"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className={`text-xs font-semibold ${activeTab === "processing" ? "text-blue-100" : "text-blue-600"}`}>
                            In Progress
                        </p>
                        <Loader2 className={`w-4 h-4 ${activeTab === "processing" ? "text-white animate-spin" : "text-blue-500"}`} />
                    </div>
                    <p className="text-2xl font-black mt-1">{stats.processing}</p>
                </div>

                <div
                    onClick={() => setActiveTab("failed")}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        activeTab === "failed"
                            ? "bg-red-600 text-white shadow-md border-red-700"
                            : "bg-white hover:border-red-300 text-slate-900"
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <p className={`text-xs font-semibold ${activeTab === "failed" ? "text-red-100" : "text-red-600"}`}>
                            Failed
                        </p>
                        <AlertCircle className={`w-4 h-4 ${activeTab === "failed" ? "text-white" : "text-red-500"}`} />
                    </div>
                    <p className="text-2xl font-black mt-1">{stats.failed}</p>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <Card className="border shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle className="text-xl font-bold flex items-center gap-2">
                                <Layers className="w-5 h-5 text-primary" />
                                Menu Processing Queues
                            </CardTitle>
                            <CardDescription>
                                Track AI parsing jobs and append extracted items with generated temp- IDs directly into any restaurant menu.
                            </CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchJobs}
                            disabled={loading}
                            className="self-start sm:self-auto gap-1.5"
                        >
                            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-3">
                        <div className="flex items-center bg-slate-100 p-1 rounded-lg border text-xs font-semibold">
                            {[
                                { id: "all", label: "All" },
                                { id: "completed", label: "Completed" },
                                { id: "processing", label: "Processing" },
                                { id: "failed", label: "Failed" },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-3 py-1.5 rounded-md transition-all ${
                                        activeTab === tab.id
                                            ? "bg-white text-foreground shadow-sm font-bold"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder="Search by Job ID, Restaurant ID, Filename..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 h-9 text-sm"
                                />
                            </div>
                            <Button type="submit" size="sm" variant="secondary" className="h-9">
                                Search
                            </Button>
                        </form>
                    </div>
                </CardHeader>

                <CardContent className="pt-0">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm font-medium">Fetching queues from database...</p>
                        </div>
                    ) : jobs.length === 0 ? (
                        <div className="text-center p-12 text-muted-foreground border border-dashed rounded-xl bg-slate-50/50">
                            <Layers className="w-10 h-10 mx-auto text-slate-400 mb-3" />
                            <h4 className="font-bold text-slate-700">No queue jobs found</h4>
                            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                                {searchQuery
                                    ? "No results matched your search query. Try clearing filters."
                                    : "There are currently no menu upload jobs in this status filter."}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {jobs.map((job) => {
                                const hasExtractedData =
                                    job.summary?.has_data ||
                                    Boolean(job.chain_outputs?.normalized_menu || job.chain_outputs?.merged_items);
                                const itemCount = job.summary?.item_count || 0;
                                const categoryCount = job.summary?.category_count || 0;
                                const sampleCats = job.summary?.sample_categories || [];

                                return (
                                    <div
                                        key={job.job_id || job._id}
                                        className="border rounded-xl p-4 md:p-5 bg-white hover:border-slate-300 transition-all shadow-sm space-y-4"
                                    >
                                        {/* Top Row: Meta and Status */}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Job ID */}
                                                <div className="flex items-center bg-slate-100 border rounded-md px-2 py-0.5 text-xs font-mono text-slate-700">
                                                    <span className="truncate max-w-[140px] sm:max-w-none">{job.job_id}</span>
                                                    <button
                                                        onClick={() => handleCopyId(job.job_id)}
                                                        className="ml-1.5 text-slate-400 hover:text-slate-800"
                                                        title="Copy Job ID"
                                                    >
                                                        {copiedId === job.job_id ? (
                                                            <Check className="w-3 h-3 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Restaurant ID */}
                                                <div className="flex items-center gap-1 bg-slate-50 border rounded-md px-2 py-0.5 text-xs text-slate-600 font-medium">
                                                    <Store className="w-3 h-3 text-slate-400" />
                                                    <span>Res ID: <strong>{job.restaurant_id}</strong></span>
                                                </div>

                                                {/* Platform */}
                                                <Badge variant="outline" className="text-xs uppercase font-bold tracking-wider">
                                                    {job.platform || "zomato"}
                                                </Badge>

                                                {/* Type */}
                                                <Badge variant="secondary" className="text-xs">
                                                    {job.job_type === "PRICE_UPDATE" ? "Price Update" : "Menu Upload"}
                                                </Badge>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(job.status)}
                                            </div>
                                        </div>

                                        {/* Middle Info Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs text-muted-foreground">
                                            <div className="flex flex-wrap items-center gap-4">
                                                <div className="flex items-center gap-1.5">
                                                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>
                                                        {job.upload_type === "text"
                                                            ? "Raw Text Input"
                                                            : `${job.total_files || job.files?.length || 1} File(s)`}
                                                    </span>
                                                    {job.files?.[0]?.filename && (
                                                        <span className="text-slate-400 truncate max-w-[180px]">
                                                            ({job.files[0].filename})
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>{formatDate(job.created_at || job.createdAt)}</span>
                                                </div>
                                            </div>

                                            {/* Extracted Menu Summary Tags */}
                                            {hasExtractedData && (
                                                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                                                        <Utensils className="w-3 h-3" />
                                                        {itemCount > 0 ? `${itemCount} Items` : "Parsed Items"}
                                                    </span>
                                                    {categoryCount > 0 && (
                                                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                                                            {categoryCount} Categories
                                                        </span>
                                                    )}
                                                    {sampleCats.length > 0 && (
                                                        <span className="text-slate-400 hidden lg:inline">
                                                            ({sampleCats.join(", ")}...)
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Active Progress Bar */}
                                        {job.status === "processing" && (
                                            <div className="bg-slate-50 border p-3 rounded-lg space-y-1.5">
                                                <div className="flex justify-between text-xs font-semibold text-slate-700">
                                                    <span>Step: {job.step || "Processing Menu Pages..."}</span>
                                                    <span>{job.progress || 0}%</span>
                                                </div>
                                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="bg-primary h-2 rounded-full transition-all duration-500"
                                                        style={{ width: `${job.progress || 10}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Banner */}
                                        {job.status === "failed" && job.error && (
                                            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-xs flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                <div className="flex-1 break-all">
                                                    <p className="font-semibold">Processing Error:</p>
                                                    <p>{job.error}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Bottom Action Buttons */}
                                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
                                            <div className="text-xs text-slate-500 flex items-center gap-2">
                                                {job.completed_at ? (
                                                    <span>Completed: {formatDate(job.completed_at)}</span>
                                                ) : (
                                                    <span>Type: {job.upload_type || "images"}</span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Preview Extracted Menu Button */}
                                                {hasExtractedData && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setPreviewJob(job)}
                                                        className="h-8 text-xs font-semibold gap-1.5"
                                                    >
                                                        <Eye className="w-3.5 h-3.5 text-slate-500" />
                                                        Preview Data
                                                    </Button>
                                                )}

                                                {/* Append to Menu Button */}
                                                {hasExtractedData && (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => openAppendModal(job)}
                                                        className="h-8 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                                    >
                                                        <PlusCircle className="w-3.5 h-3.5" />
                                                        Append to Menu
                                                    </Button>
                                                )}

                                                {/* Resume Button for Failed Jobs */}
                                                {job.status === "failed" && (
                                                    <Button
                                                        size="sm"
                                                        variant="default"
                                                        onClick={() => handleResume(job.job_id)}
                                                        disabled={resumingId === job.job_id}
                                                        className="h-8 text-xs font-semibold gap-1.5"
                                                    >
                                                        {resumingId === job.job_id ? (
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        ) : (
                                                            <PlayCircle className="w-3.5 h-3.5" />
                                                        )}
                                                        Resume Job
                                                    </Button>
                                                )}

                                                {/* Delete Button */}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(job.job_id)}
                                                    disabled={deletingId === job.job_id}
                                                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                    title="Delete Queue"
                                                >
                                                    {deletingId === job.job_id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Enhanced Append to Restaurant Menu Modal */}
            <Dialog open={Boolean(appendModalJob)} onOpenChange={(open) => !open && setAppendModalJob(null)}>
                <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-5 pb-3 border-b bg-slate-50/50">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                            <PlusCircle className="w-5 h-5 text-emerald-600" />
                            Append Items to Restaurant Menu
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Select a target restaurant from your accounts or enter any custom <strong>Restaurant ID</strong> to append the extracted menu items with <code>temp-</code> IDs.
                        </DialogDescription>
                    </DialogHeader>

                    {appendModalJob && (
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {/* Queue Source Info Banner */}
                            <div className="bg-emerald-50/70 border border-emerald-200/80 p-3 rounded-xl flex items-center justify-between text-xs">
                                <div>
                                    <span className="text-emerald-800 font-semibold block">Queue Source Data:</span>
                                    <span className="text-emerald-950 font-bold text-sm">
                                        {appendModalJob.summary?.item_count || "All"} Items across {appendModalJob.summary?.category_count || "All"} Categories
                                    </span>
                                </div>
                                <div className="text-right font-mono text-[11px] text-emerald-700 bg-white/80 px-2.5 py-1 rounded-lg border border-emerald-200">
                                    Queue Res ID: {appendModalJob.restaurant_id}
                                </div>
                            </div>

                            {/* Target Restaurant Selection & Input */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-primary" />
                                        Target Restaurant & Res ID
                                    </label>
                                    {targetResId && (
                                        <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5" />
                                            Selected: <strong className="font-mono">{targetResId}</strong>
                                        </span>
                                    )}
                                </div>

                                {/* Direct Res ID Input */}
                                <div className="space-y-1.5">
                                    <div className="relative">
                                        <Input
                                            value={targetResId}
                                            onChange={(e) => {
                                                setTargetResId(e.target.value);
                                                const match = allRestaurants.find((r) => r.resId === e.target.value.trim());
                                                setTargetResName(match ? match.name : "");
                                            }}
                                            placeholder="Enter or paste Restaurant ID (e.g. 22880802)"
                                            className="font-mono text-sm font-semibold h-10 pr-24 focus:ring-2 focus:ring-emerald-500"
                                        />
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded">
                                            <span>Res ID</span>
                                        </div>
                                    </div>
                                    {targetResName && (
                                        <p className="text-xs text-slate-600 font-medium pl-1 flex items-center gap-1">
                                            <Store className="w-3 h-3 text-slate-400" />
                                            Restaurant Name: <strong>{targetResName}</strong>
                                        </p>
                                    )}
                                </div>

                                {/* Quick Shortcuts */}
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="text-[11px] text-slate-400 font-semibold">Quick Set:</span>
                                    {appendModalJob.restaurant_id && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetResId(appendModalJob.restaurant_id);
                                                setTargetPlatform(appendModalJob.platform || "zomato");
                                                const m = allRestaurants.find((r) => r.resId === appendModalJob.restaurant_id);
                                                setTargetResName(m ? m.name : "");
                                            }}
                                            className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                                                targetResId === appendModalJob.restaurant_id
                                                    ? "bg-slate-900 text-white font-bold border-slate-900"
                                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                                            }`}
                                        >
                                            Queue Default ({appendModalJob.restaurant_id})
                                        </button>
                                    )}

                                    {activeResId && activeResId !== appendModalJob.restaurant_id && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTargetResId(activeResId);
                                                setTargetPlatform(activePlatform || "zomato");
                                                const m = allRestaurants.find((r) => r.resId === activeResId);
                                                setTargetResName(m ? m.name : "");
                                            }}
                                            className={`text-[11px] px-2.5 py-1 rounded-md border transition-all ${
                                                targetResId === activeResId
                                                    ? "bg-slate-900 text-white font-bold border-slate-900"
                                                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                                            }`}
                                        >
                                            Active Editor Res ({activeResId})
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Connected Restaurants List Selector */}
                            <div className="border rounded-xl p-3 bg-slate-50/50 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700">
                                        Or Pick from Connected Restaurants ({allRestaurants.length}):
                                    </span>
                                    <div className="flex gap-1 bg-white p-0.5 rounded-lg border text-[11px] font-semibold">
                                        {["all", "zomato", "swiggy", "petpooja"].map((tab) => (
                                            <button
                                                key={tab}
                                                type="button"
                                                onClick={() => setSelectedPlatformTab(tab)}
                                                className={`px-2 py-0.5 rounded capitalize ${
                                                    selectedPlatformTab === tab
                                                        ? "bg-slate-900 text-white font-bold"
                                                        : "text-slate-500 hover:text-slate-800"
                                                }`}
                                            >
                                                {tab}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Restaurant Search Bar */}
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search connected restaurant by name or ID..."
                                        value={restaurantSearch}
                                        onChange={(e) => setRestaurantSearch(e.target.value)}
                                        className="h-8 pl-8 text-xs bg-white"
                                    />
                                </div>

                                {/* Scrollable Restaurant Cards */}
                                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                                    {filteredRestaurants.length === 0 ? (
                                        <div className="text-center py-4 text-xs text-muted-foreground">
                                            {allRestaurants.length === 0
                                                ? "No connected restaurants found. You can enter any Res ID manually in the input above."
                                                : "No matching restaurants found."}
                                        </div>
                                    ) : (
                                        filteredRestaurants.map((rest) => {
                                            const isSelected = targetResId === rest.resId && targetPlatform === rest.platform;
                                            return (
                                                <div
                                                    key={`${rest.platform}-${rest.resId}`}
                                                    onClick={() => selectRestaurant(rest)}
                                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border text-xs ${
                                                        isSelected
                                                            ? "bg-emerald-50 border-emerald-400 text-emerald-950 font-bold shadow-2xs"
                                                            : "bg-white hover:border-slate-300 text-slate-700"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 truncate">
                                                        <div className="w-7 h-7 rounded-md bg-slate-100 border flex items-center justify-center shrink-0">
                                                            {rest.thumbnail ? (
                                                                <img
                                                                    src={rest.thumbnail}
                                                                    alt={rest.name}
                                                                    className="w-full h-full object-cover rounded-md"
                                                                />
                                                            ) : (
                                                                <Store className="w-3.5 h-3.5 text-slate-500" />
                                                            )}
                                                        </div>
                                                        <div className="truncate">
                                                            <p className="truncate leading-tight font-semibold">
                                                                {rest.name}
                                                            </p>
                                                            <p className="text-[11px] text-muted-foreground font-mono">
                                                                ID: {rest.resId} {rest.location ? `· ${rest.location}` : ""}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] uppercase font-bold px-1.5 py-0"
                                                        >
                                                            {rest.platform}
                                                        </Badge>
                                                        {isSelected && (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            {/* Platform Toggle */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-700">Platform</label>
                                <div className="flex gap-2">
                                    {["zomato", "swiggy", "petpooja"].map((plat) => (
                                        <button
                                            key={plat}
                                            type="button"
                                            onClick={() => setTargetPlatform(plat)}
                                            className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-bold capitalize transition-all ${
                                                targetPlatform === plat
                                                    ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                                    : "bg-white text-slate-700 hover:bg-slate-50"
                                            }`}
                                        >
                                            {plat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-lg text-xs">
                                <strong>ID Schema Generation:</strong> All appended categories, subcategories, items, and variants will be saved to restaurant <code>{targetResId || "(Select Res ID)"}</code> with unique <code>temp-UUID</code> strings.
                            </div>
                        </div>
                    )}

                    <DialogFooter className="p-4 border-t bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground font-mono">
                            Target: <span className="font-bold text-slate-900">{targetResId || "None"}</span> ({targetPlatform})
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAppendModalJob(null)}
                                disabled={isAppending}
                                className="flex-1 sm:flex-none"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleExecuteAppend}
                                disabled={isAppending || !targetResId.trim()}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 flex-1 sm:flex-none shadow-sm"
                            >
                                {isAppending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Appending Items...
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight className="w-4 h-4" />
                                        Append to Menu
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Extracted Menu Data Dialog */}
            <Dialog open={Boolean(previewJob)} onOpenChange={(open) => !open && setPreviewJob(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="p-5 pb-3 border-b bg-slate-50/50">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                            <Eye className="w-5 h-5 text-primary" />
                            Extracted Menu Preview
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Queue: <span className="font-mono font-semibold">{previewJob?.job_id}</span> · Original Res ID: {previewJob?.restaurant_id}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        {previewCategories.length === 0 ? (
                            <div className="text-center p-8 text-muted-foreground">
                                No categories or items available to preview.
                            </div>
                        ) : (
                            previewCategories.map((cat, catIdx) => (
                                <div key={catIdx} className="border rounded-xl p-4 bg-slate-50/50 space-y-3">
                                    <div className="flex items-center justify-between border-b pb-2">
                                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                                                {catIdx + 1}
                                            </span>
                                            {cat.name}
                                        </h4>
                                        <Badge variant="outline" className="text-xs font-semibold">
                                            {(cat.sub_category || []).reduce((acc, s) => acc + (s.items?.length || 0), 0)} Items
                                        </Badge>
                                    </div>

                                    <div className="space-y-3 pl-2">
                                        {(cat.sub_category || []).map((sub, subIdx) => (
                                            <div key={subIdx} className="space-y-2">
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                                    {sub.name} ({sub.items?.length || 0})
                                                </p>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {(sub.items || []).map((item, itemIdx) => (
                                                        <div
                                                            key={itemIdx}
                                                            className="border rounded-lg p-2.5 bg-white text-xs space-y-1 shadow-2xs"
                                                        >
                                                            <div className="flex items-start justify-between gap-1">
                                                                <span className="font-bold text-slate-800 line-clamp-1">
                                                                    {item.name}
                                                                </span>
                                                                <span className="font-bold text-emerald-700 shrink-0">
                                                                    ₹{item.base_price || item.price || 0}
                                                                </span>
                                                            </div>
                                                            {item.description && (
                                                                <p className="text-slate-400 line-clamp-1 text-[11px]">
                                                                    {item.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-1.5 pt-1">
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                        item.is_veg === "NON_VEG"
                                                                            ? "bg-red-100 text-red-700"
                                                                            : item.is_veg === "EGG"
                                                                            ? "bg-amber-100 text-amber-700"
                                                                            : "bg-green-100 text-green-700"
                                                                    }`}
                                                                >
                                                                    {item.is_veg || "VEG"}
                                                                </span>
                                                                {item.variants?.length > 0 && (
                                                                    <span className="text-[10px] text-slate-400">
                                                                        {item.variants.length} variant group(s)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <DialogFooter className="p-4 border-t bg-slate-50/50 flex items-center justify-between">
                        <Button variant="outline" size="sm" onClick={() => setPreviewJob(null)}>
                            Close
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => {
                                const job = previewJob;
                                setPreviewJob(null);
                                openAppendModal(job);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-sm"
                        >
                            <PlusCircle className="w-4 h-4" />
                            Append this Menu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
