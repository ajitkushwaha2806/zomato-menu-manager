"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Store,
  RefreshCw,
  Search,
  Users,
  Sparkles,
  Zap,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Flame,
} from "lucide-react";
import { format } from "date-fns";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { toast } from "sonner";

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("today"); // "today" | "yesterday" | "7days" | "30days" | "all" | "custom"
  const [customDate, setCustomDate] = useState({ from: new Date(), to: new Date() });
  const [data, setData] = useState({
    summary: {
      totalOutletsWorkedOn: 0,
      totalActions: 0,
      triggersCount: 0,
      syncsCount: 0,
      transfersCount: 0,
      successCount: 0,
      failCount: 0,
      successRate: "100%",
      teamMembers: [],
      teamMembersCount: 0,
    },
    outletsWorkedOn: [],
    feed: [],
    triggers: [],
    syncs: [],
    transfers: [],
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Expanded outlet cards
  const [expandedOutlets, setExpandedOutlets] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  const fetchAnalytics = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) setIsRefreshing(true);
      else setLoading(true);

      let url = `/api/analytics?period=${period}`;
      if (period === "custom" && customDate?.from) {
        const fromDate = new Date(customDate.from);
        const fromISO = new Date(fromDate.setHours(0, 0, 0, 0)).toISOString();
        const toDate = new Date(customDate.to || customDate.from);
        const toISO = new Date(toDate.setHours(23, 59, 59, 999)).toISOString();
        url += `&startDate=${fromISO}&endDate=${toISO}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (json.success) {
        setData({
          summary: json.summary || {
            totalOutletsWorkedOn: 0,
            totalActions: 0,
            triggersCount: 0,
            syncsCount: 0,
            transfersCount: 0,
            successCount: 0,
            failCount: 0,
            successRate: "100%",
            teamMembers: [],
            teamMembersCount: 0,
          },
          outletsWorkedOn: json.outletsWorkedOn || [],
          feed: json.feed || [],
          triggers: json.triggers || [],
          syncs: json.syncs || [],
          transfers: json.transfers || [],
        });
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [period, customDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleCopyId = (id) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast.success(`Copied outlet ID ${id}`);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const toggleExpandOutlet = (id) => {
    setExpandedOutlets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filtered outlets
  const filteredOutlets = useMemo(() => {
    return (data.outletsWorkedOn || []).filter((outlet) => {
      // Search
      const search = searchTerm.toLowerCase().trim();
      const nameMatch = (outlet.restaurantName || "").toLowerCase().includes(search);
      const idMatch = String(outlet.resId || "").toLowerCase().includes(search);
      const userMatch = (outlet.users || []).some((u) => u.toLowerCase().includes(search));
      if (search && !nameMatch && !idMatch && !userMatch) return false;

      // Platform
      if (platformFilter !== "all") {
        if (!outlet.platforms.includes(platformFilter)) return false;
      }

      // User
      if (userFilter !== "all") {
        if (!outlet.users.includes(userFilter)) return false;
      }

      // Status
      if (statusFilter === "success") {
        if (outlet.failCount > 0 && outlet.successCount === 0) return false;
      } else if (statusFilter === "failed") {
        if (outlet.failCount === 0) return false;
      }

      return true;
    });
  }, [data.outletsWorkedOn, searchTerm, platformFilter, userFilter, statusFilter]);

  // Filtered Live Feed
  const filteredFeed = useMemo(() => {
    return (data.feed || []).filter((item) => {
      const search = searchTerm.toLowerCase().trim();
      const nameMatch = (item.restaurantName || "").toLowerCase().includes(search);
      const idMatch = String(item.resId || "").toLowerCase().includes(search);
      const userMatch = (item.user || "").toLowerCase().includes(search);
      if (search && !nameMatch && !idMatch && !userMatch) return false;

      if (platformFilter !== "all" && item.platform !== platformFilter) return false;
      if (userFilter !== "all" && item.user !== userFilter) return false;
      if (statusFilter === "success" && item.status !== "SUCCESS" && item.status !== "completed") return false;
      if (statusFilter === "failed" && item.status !== "FAILED" && item.status !== "failed") return false;

      return true;
    });
  }, [data.feed, searchTerm, platformFilter, userFilter, statusFilter]);

  // Extract all team members
  const allTeamMembers = useMemo(() => {
    const set = new Set();
    (data.feed || []).forEach((item) => {
      if (item.user && item.user !== "System" && item.user !== "Unknown User" && item.user !== "Team Member") {
        set.add(item.user);
      }
    });
    return Array.from(set).sort();
  }, [data.feed]);

  const getPlatformBadge = (platform) => {
    const p = (platform || "").toLowerCase();
    if (p.includes("zomato")) {
      return (
        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 hover:bg-red-500/20 text-[10px] font-bold uppercase tracking-wider">
          Zomato
        </Badge>
      );
    }
    if (p.includes("swiggy")) {
      return (
        <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 hover:bg-orange-500/20 text-[10px] font-bold uppercase tracking-wider">
          Swiggy
        </Badge>
      );
    }
    if (p.includes("ownly")) {
      return (
        <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 hover:bg-purple-500/20 text-[10px] font-bold uppercase tracking-wider">
          Ownly
        </Badge>
      );
    }
    if (p.includes("petpooja")) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 hover:bg-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
          Petpooja
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
        {platform || "Outlet"}
      </Badge>
    );
  };

  const getStatusBadge = (status) => {
    const s = (status || "").toUpperCase();
    if (s === "SUCCESS" || s === "COMPLETED") {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300 font-semibold text-[11px] gap-1 flex items-center">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Success
        </Badge>
      );
    }
    if (s === "FAILED") {
      return (
        <Badge variant="destructive" className="font-semibold text-[11px] gap-1 flex items-center">
          <XCircle className="w-3 h-3 text-white" /> Failed
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[11px] font-semibold gap-1 flex items-center">
        <Clock className="w-3 h-3" /> {s}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-neutral-950 p-4 md:p-8 lg:p-10 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-primary/10 text-primary rounded-xl">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                  Outlet Operations & Analytics
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-bold text-xs py-0.5">
                    Live Team Tracking
                  </Badge>
                </h1>
                <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                  Real-time record of all menu triggers, syncs, and transfers worked on by everyone across all outlets.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-200/70 dark:bg-neutral-800 p-1 rounded-xl shadow-xs">
              <button
                type="button"
                onClick={() => setPeriod("today")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  period === "today"
                    ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Flame className={`w-3.5 h-3.5 ${period === "today" ? "text-amber-500 fill-amber-500" : ""}`} />
                Today
              </button>
              <button
                type="button"
                onClick={() => setPeriod("yesterday")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === "yesterday"
                    ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setPeriod("7days")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === "7days"
                    ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setPeriod("30days")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === "30days"
                    ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setPeriod("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === "all"
                    ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Time
              </button>
            </div>

            {/* Custom Date Range Picker */}
            <DatePickerWithRange
              date={customDate}
              setDate={(newDate) => {
                setCustomDate(newDate);
                if (newDate?.from) setPeriod("custom");
              }}
              className="text-xs"
            />

            {/* Manual Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => fetchAnalytics(true)}
              disabled={isRefreshing || loading}
              className="rounded-xl h-9 w-9 bg-white dark:bg-neutral-900 border-border/60 hover:bg-slate-100"
              title="Refresh Analytics"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </Button>
          </div>
        </div>

        {/* 6 Key Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Outlets Worked</span>
                <Store className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.totalOutletsWorkedOn}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Distinct outlets {period === "today" ? "today" : "in period"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Actions</span>
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.totalActions}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Triggers, syncs & copies
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Menu Triggers</span>
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.triggersCount}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Published to platforms
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Menu Syncs</span>
                <RefreshCw className="h-4 w-4 text-purple-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.syncsCount}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Queued updates
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Transfers</span>
                <ArrowRightLeft className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.transfersCount}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Cross-outlet menu copies
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
                <CheckCircle2 className="h-4 w-4 text-teal-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {loading ? <Skeleton className="h-7 w-16" /> : data.summary.successRate}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {data.summary.successCount} ok • {data.summary.failCount} failed
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Global Filter Bar (Platform, Team Member, Status, Search) */}
        <div className="bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-border/60 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by restaurant name, outlet ID, or team member..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50/70 dark:bg-neutral-800 border-border/60 rounded-xl"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Platform Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-neutral-800 p-1 rounded-xl text-xs">
              {["all", "zomato", "swiggy", "ownly", "petpooja"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-lg font-semibold capitalize transition-all ${
                    platformFilter === p
                      ? "bg-white dark:bg-neutral-900 text-primary shadow-xs font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "all" ? "All Platforms" : p}
                </button>
              ))}
            </div>

            {/* Team Member Filter */}
            {allTeamMembers.length > 0 && (
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="h-9 px-3 rounded-xl border border-border/60 bg-slate-50/70 dark:bg-neutral-800 text-xs font-semibold text-foreground focus:outline-hidden"
              >
                <option value="all">👥 All Team Members ({allTeamMembers.length})</option>
                {allTeamMembers.map((member) => (
                  <option key={member} value={member}>
                    👤 {member}
                  </option>
                ))}
              </select>
            )}

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-border/60 bg-slate-50/70 dark:bg-neutral-800 text-xs font-semibold text-foreground focus:outline-hidden"
            >
              <option value="all">⚡ All Statuses</option>
              <option value="success">✅ Successful Only</option>
              <option value="failed">❌ Failed Only</option>
            </select>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="outlets" className="space-y-4">
          <TabsList className="bg-slate-200/60 dark:bg-neutral-800 p-1 rounded-xl">
            <TabsTrigger value="outlets" className="rounded-lg text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              Outlets Worked On ({filteredOutlets.length})
            </TabsTrigger>
            <TabsTrigger value="feed" className="rounded-lg text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Live Activity Feed ({filteredFeed.length})
            </TabsTrigger>
            <TabsTrigger value="triggers" className="rounded-lg text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Menu Triggers ({data.triggers.length})
            </TabsTrigger>
            <TabsTrigger value="syncs" className="rounded-lg text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Menu Syncs ({data.syncs.length})
            </TabsTrigger>
            <TabsTrigger value="transfers" className="rounded-lg text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-900 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfers ({data.transfers.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: OUTLETS WORKED ON */}
          <TabsContent value="outlets" className="space-y-3">
            <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900 overflow-hidden">
              <CardHeader className="p-5 border-b border-border/40 bg-slate-50/50 dark:bg-neutral-900/50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      {period === "today"
                        ? "Outlets Worked On Today"
                        : period === "yesterday"
                        ? "Outlets Worked On Yesterday"
                        : `Outlets Worked On (${period})`}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Every restaurant outlet that received menu triggers, syncs, or transfers. Grouped by outlet name.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="font-bold text-xs">
                    {filteredOutlets.length} Outlets
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-xl" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-5 w-[300px]" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredOutlets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                    <Store className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="font-semibold text-foreground">No outlet activity recorded for this period.</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      When team members trigger menus, queue changes, or transfer dishes, they will automatically appear here with restaurant names.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {filteredOutlets.map((outlet) => {
                      const isExpanded = Boolean(expandedOutlets[outlet.resId]);
                      const isCopied = copiedId === outlet.resId;

                      return (
                        <div key={outlet.resId} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-neutral-800/40">
                          {/* Row Header */}
                          <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-3.5 min-w-0 flex-1">
                              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary font-black flex items-center justify-center text-base shrink-0 border border-primary/20">
                                {outlet.restaurantName?.charAt(0)?.toUpperCase() || "R"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-bold text-base md:text-lg text-foreground truncate">
                                    {outlet.restaurantName}
                                  </h3>
                                  <div className="flex items-center gap-1">
                                    {outlet.platforms.map((p) => (
                                      <span key={p}>{getPlatformBadge(p)}</span>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <div className="flex items-center gap-1 font-mono bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md">
                                    <span>ID: {outlet.resId}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyId(outlet.resId)}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Copy ID"
                                    >
                                      {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                  </div>

                                  <span>•</span>
                                  <span className="font-semibold text-foreground">
                                    {outlet.totalActions} action{outlet.totalActions !== 1 ? "s" : ""}
                                    {outlet.triggersCount > 0 ? ` (${outlet.triggersCount} triggers)` : ""}
                                    {outlet.syncsCount > 0 ? ` (${outlet.syncsCount} syncs)` : ""}
                                  </span>

                                  {outlet.users.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-primary font-medium flex items-center gap-1">
                                        <Users className="w-3 h-3" />
                                        Worked by: {outlet.users.join(", ")}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status & Timestamp */}
                            <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                              <div className="text-left md:text-right">
                                <div className="flex items-center md:justify-end gap-2">
                                  {getStatusBadge(outlet.latestStatus)}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">
                                  Latest: {format(new Date(outlet.latestTimestamp), "MMM d, h:mm a")}
                                </p>
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleExpandOutlet(outlet.resId)}
                                className="h-8 px-2 rounded-lg text-xs"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Action History for this Outlet */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="border-t border-border/40 bg-slate-50/90 dark:bg-neutral-850 px-5 py-3 space-y-2 text-xs"
                              >
                                <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                                  Action History for {outlet.restaurantName}
                                </p>
                                <div className="space-y-1.5">
                                  {outlet.actions.map((act, idx) => (
                                    <div
                                      key={act.id || idx}
                                      className="p-2.5 rounded-xl bg-white dark:bg-neutral-900 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        {getStatusBadge(act.status)}
                                        <span className="font-bold text-foreground">{act.type}</span>
                                        {act.platform && getPlatformBadge(act.platform)}
                                        {act.taskId && (
                                          <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                                            Task: {act.taskId}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                                        <span>User: <strong className="text-foreground">{act.user}</strong></span>
                                        <span>•</span>
                                        <span>{format(new Date(act.createdAt), "MMM d, yyyy 'at' h:mm:ss a")}</span>
                                      </div>
                                      {act.error && (
                                        <p className="text-[11px] text-red-600 bg-red-50 p-1.5 rounded w-full">
                                          Error: {act.error}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: LIVE ACTIVITY FEED */}
          <TabsContent value="feed">
            <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900 overflow-hidden">
              <CardHeader className="p-5 border-b border-border/40 bg-slate-50/50 dark:bg-neutral-900/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Chronological Live Activity Stream
                </CardTitle>
                <CardDescription className="text-xs">
                  Every operation performed by all team members in chronological order.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center space-x-4">
                          <Skeleton className="h-10 w-10 rounded-md" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredFeed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                      <p>No activity logs found for this filter.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {filteredFeed.map((item) => (
                        <div key={item.id} className="p-4 md:p-5 hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-base text-foreground truncate">
                                {item.restaurantName}
                              </span>
                              {getPlatformBadge(item.platform)}
                              {getStatusBadge(item.status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                              <span className="font-medium text-foreground">{item.type}</span>
                              <span>•</span>
                              <span>Res ID: <strong>{item.resId}</strong></span>
                              <span>•</span>
                              <span className="text-primary font-semibold">User: {item.user}</span>
                              {item.taskId && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-blue-600 dark:text-blue-400">Task: {item.taskId}</span>
                                </>
                              )}
                            </div>
                            {item.error && (
                              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 p-2 rounded-lg mt-1">
                                {item.error}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                            <p className="font-medium text-foreground">{format(new Date(item.createdAt), "MMM d, yyyy")}</p>
                            <p>{format(new Date(item.createdAt), "h:mm:ss a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: MENU TRIGGERS */}
          <TabsContent value="triggers">
            <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900 overflow-hidden">
              <CardHeader className="p-5 border-b border-border/40 bg-slate-50/50 dark:bg-neutral-900/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Menu Trigger Records
                </CardTitle>
                <CardDescription className="text-xs">
                  All menu publish triggers sent to aggregators with confirmed restaurant names.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      ))}
                    </div>
                  ) : data.triggers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                      <p>No trigger records found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {data.triggers.map((trigger) => (
                        <div key={trigger._id} className="p-4 md:p-5 hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <h4 className="font-bold text-base text-foreground truncate">
                                {trigger.restaurantName}
                              </h4>
                              {getPlatformBadge(trigger.platform)}
                              {getStatusBadge(trigger.status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                              <span>Res ID: <strong>{trigger.resId}</strong></span>
                              <span>•</span>
                              <span className="font-mono text-blue-600 dark:text-blue-400">Task: {trigger.taskId}</span>
                              <span>•</span>
                              <span className="text-primary font-medium">User: {trigger.user}</span>
                            </div>
                            {trigger.error && (
                              <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg mt-1">
                                {trigger.error}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                            <p className="font-medium text-foreground">{format(new Date(trigger.createdAt), "MMM d, yyyy")}</p>
                            <p>{format(new Date(trigger.createdAt), "h:mm a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: MENU SYNCS */}
          <TabsContent value="syncs">
            <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900 overflow-hidden">
              <CardHeader className="p-5 border-b border-border/40 bg-slate-50/50 dark:bg-neutral-900/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-purple-500" />
                  Menu Sync Logs
                </CardTitle>
                <CardDescription className="text-xs">
                  Full historical audit of queued updates and background processor syncs.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      ))}
                    </div>
                  ) : data.syncs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                      <p>No sync records found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {data.syncs.map((sync) => (
                        <div key={sync._id} className="p-4 md:p-5 hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2.5">
                              <h4 className="font-bold text-base text-foreground truncate">
                                {sync.restaurantName}
                              </h4>
                              {getPlatformBadge(sync.platform)}
                              {getStatusBadge(sync.status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                              <span>Res ID: <strong>{sync.resId}</strong></span>
                              {sync.accountName && (
                                <>
                                  <span>•</span>
                                  <span>Account: {sync.accountName}</span>
                                </>
                              )}
                              {sync.taskId && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-blue-600 dark:text-blue-400">Task: {sync.taskId}</span>
                                </>
                              )}
                              {sync.user && (
                                <>
                                  <span>•</span>
                                  <span className="text-primary font-medium">User: {sync.user}</span>
                                </>
                              )}
                            </div>
                            {sync.error && (
                              <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg mt-1">
                                {sync.error}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                            <p className="font-medium text-foreground">{format(new Date(sync.createdAt), "MMM d, yyyy")}</p>
                            <p>{format(new Date(sync.createdAt), "h:mm a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: TRANSFERS */}
          <TabsContent value="transfers">
            <Card className="rounded-2xl border-border/50 shadow-xs bg-white dark:bg-neutral-900 overflow-hidden">
              <CardHeader className="p-5 border-b border-border/40 bg-slate-50/50 dark:bg-neutral-900/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <ArrowRightLeft className="h-5 w-5 text-indigo-500" />
                  Cross-Outlet Transfers
                </CardTitle>
                <CardDescription className="text-xs">
                  Menus, photos, and categories transferred between restaurant outlets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  {loading ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="space-y-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      ))}
                    </div>
                  ) : data.transfers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                      <p>No transfer records found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {data.transfers.map((transfer) => (
                        <div key={transfer._id} className="p-4 md:p-5 hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-foreground">
                                {transfer.fromResName}
                              </span>
                              <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-bold text-base text-primary">
                                {transfer.toResName}
                              </span>
                              {getStatusBadge(transfer.status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                              <span>From ID: {transfer.fromResId}</span>
                              <span>→</span>
                              <span>To ID: {transfer.toResId}</span>
                              <span>•</span>
                              <span>Platform: <strong className="text-foreground capitalize">{transfer.platform}</strong></span>
                              <span>•</span>
                              <span className="text-primary font-medium">User: {transfer.user}</span>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                            <p className="font-medium text-foreground">{format(new Date(transfer.createdAt), "MMM d, yyyy")}</p>
                            <p>{format(new Date(transfer.createdAt), "h:mm a")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}
