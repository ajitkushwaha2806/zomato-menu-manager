"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Activity, ArrowRightLeft, CheckCircle2, Store } from "lucide-react";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";

export default function AnalyticsPage() {
  const [transfers, setTransfers] = useState([]);
  const [topOutlets, setTopOutlets] = useState([]);
  const [syncs, setSyncs] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSyncs, setLoadingSyncs] = useState(true);
  const [loadingTriggers, setLoadingTriggers] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    recent: 0,
  });

  const [date, setDate] = useState(() => {
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    return {
      from: sevenDaysAgo,
      to: today,
    };
  });

  useEffect(() => {
    async function fetchTransfers() {
      try {
        setLoading(true);
        let url = "/api/transfers";
        if (date?.from) {
          const fromDate = new Date(date.from);
          const fromISO = new Date(fromDate.setHours(0, 0, 0, 0)).toISOString();
          const toDate = new Date(date.to || date.from);
          const toISO = new Date(toDate.setHours(23, 59, 59, 999)).toISOString();
          url += `?startDate=${fromISO}&endDate=${toISO}`;
        }
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.success && json.data) {
          setTransfers(json.data);
          
          const total = json.data.length;
          const completed = json.data.filter((t) => t.status === "COMPLETED").length;
          
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const recent = json.data.filter((t) => new Date(t.createdAt) >= sevenDaysAgo).length;

          setStats({ total, completed, recent });

          const outletCounts = {};
          json.data.forEach((t) => {
            if (t.fromResId) {
              if (!outletCounts[t.fromResId]) {
                outletCounts[t.fromResId] = { id: t.fromResId, name: t.fromResName, count: 0, latestTimestamp: t.createdAt };
              }
              outletCounts[t.fromResId].count += 1;
              if (new Date(t.createdAt) > new Date(outletCounts[t.fromResId].latestTimestamp)) {
                outletCounts[t.fromResId].latestTimestamp = t.createdAt;
              }
            }
            if (t.toResId) {
              if (!outletCounts[t.toResId]) {
                outletCounts[t.toResId] = { id: t.toResId, name: t.toResName, count: 0, latestTimestamp: t.createdAt };
              }
              outletCounts[t.toResId].count += 1;
              if (new Date(t.createdAt) > new Date(outletCounts[t.toResId].latestTimestamp)) {
                outletCounts[t.toResId].latestTimestamp = t.createdAt;
              }
            }
          });

          const sortedOutlets = Object.values(outletCounts)
            .sort((a, b) => new Date(b.latestTimestamp) - new Date(a.latestTimestamp));
          setTopOutlets(sortedOutlets);
        }
      } catch (error) {
        console.error("Failed to fetch transfers:", error);
      } finally {
        setLoading(false);
      }
    }
    
    async function fetchSyncs() {
      try {
        setLoadingSyncs(true);
        let url = "/api/syncs";
        if (date?.from) {
          const fromDate = new Date(date.from);
          const fromISO = new Date(fromDate.setHours(0, 0, 0, 0)).toISOString();
          const toDate = new Date(date.to || date.from);
          const toISO = new Date(toDate.setHours(23, 59, 59, 999)).toISOString();
          url += `?startDate=${fromISO}&endDate=${toISO}`;
        }
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setSyncs(json.data);
        }
      } catch (error) {
        console.error("Failed to fetch syncs:", error);
      } finally {
        setLoadingSyncs(false);
      }
    }

    async function fetchTriggers() {
      try {
        setLoadingTriggers(true);
        let url = "/api/triggers";
        if (date?.from) {
          const fromDate = new Date(date.from);
          const fromISO = new Date(fromDate.setHours(0, 0, 0, 0)).toISOString();
          const toDate = new Date(date.to || date.from);
          const toISO = new Date(toDate.setHours(23, 59, 59, 999)).toISOString();
          url += `?startDate=${fromISO}&endDate=${toISO}`;
        }
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setTriggers(json.data);
        }
      } catch (error) {
        console.error("Failed to fetch triggers:", error);
      } finally {
        setLoadingTriggers(false);
      }
    }

    // Always fetch if date has from
    if (date?.from) {
      fetchTransfers();
      fetchSyncs();
      fetchTriggers();
    }
  }, [date]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 lg:p-12">
      <div className="mx-auto max-w-7xl space-y-8">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0"
        >
          <div className="flex flex-col space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
              Analytics Overview
            </h1>
            <p className="text-muted-foreground text-lg">
              Monitor and track your restaurant outlet transfers, triggers, and syncs.
            </p>
          </div>
          <div className="flex items-center">
            <DatePickerWithRange date={date} setDate={setDate} />
          </div>
        </motion.div>

        {/* Stats Row */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 md:grid-cols-3"
        >
          <motion.div variants={itemVariants}>
            <Card className="border-white/10 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Transfers</CardTitle>
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-[100px]" />
                ) : (
                  <div className="text-3xl font-bold">{stats.total}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Lifetime transfers</p>
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemVariants}>
            <Card className="border-white/10 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Completed Successfully</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-[100px]" />
                ) : (
                  <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Success rate</p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-white/10 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-[100px]" />
                ) : (
                  <div className="text-3xl font-bold">{stats.recent}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Transfers in last 7 days</p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={itemVariants}>
            <Tabs defaultValue="transfers" className="w-full">
              <TabsList className="bg-muted/50 p-1">
                <TabsTrigger value="transfers">Transfers</TabsTrigger>
                <TabsTrigger value="outlets">Outlets</TabsTrigger>
                <TabsTrigger value="syncs">Sync Logs</TabsTrigger>
                <TabsTrigger value="triggers">Triggers</TabsTrigger>
              </TabsList>

              {/* Transfers Tab */}
              <TabsContent value="transfers">
                <Card className="border-white/10 overflow-hidden shadow-md">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="flex items-center gap-2">
                      <Store className="h-5 w-5" />
                      Transfer History
                    </CardTitle>
                    <CardDescription>
                      Detailed log of all outlet migrations across platforms.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {loading ? (
                        <div className="p-6 space-y-4">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center space-x-4">
                              <Skeleton className="h-12 w-12 rounded-full" />
                              <div className="space-y-2 flex-1">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-4 w-[200px]" />
                              </div>
                              <Skeleton className="h-8 w-[100px]" />
                            </div>
                          ))}
                        </div>
                      ) : transfers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                          <ArrowRightLeft className="h-12 w-12 mb-4 opacity-20" />
                          <p>No transfer history found.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {transfers.map((transfer) => (
                            <div 
                              key={transfer._id} 
                              className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-muted/40 transition-colors group"
                            >
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold text-lg">{transfer.fromResName}</span>
                                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                  <span className="font-semibold text-lg">{transfer.toResName}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                  <span>ID: {transfer.fromResId} → {transfer.toResId}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="px-2 py-0.5 bg-secondary rounded-md text-xs font-medium">
                                    {transfer.platform?.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                  </span>
                                  {transfer.details?.accountName && (
                                    <>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-foreground">Account: {transfer.details.accountName}</span>
                                    </>
                                  )}
                                  {transfer.details?.taskId && (
                                    <>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-foreground">Task: {transfer.details.taskId}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between sm:flex-col sm:items-end mt-4 sm:mt-0 gap-2">
                                <Badge 
                                  variant={transfer.status === "COMPLETED" ? "default" : "secondary"}
                                  className={transfer.status === "COMPLETED" ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:bg-green-500/20 dark:text-green-400" : ""}
                                >
                                  {transfer.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(transfer.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Outlets Tab */}
              <TabsContent value="outlets">
                <Card className="border-white/10 shadow-md">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Triggered Outlets
                    </CardTitle>
                    <CardDescription>
                      All outlets involved in transfers and their trigger counts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {loading ? (
                        <div className="p-6 space-y-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center space-x-4">
                              <Skeleton className="h-10 w-10 rounded-md" />
                              <div className="space-y-2 flex-1">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-3 w-32" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : topOutlets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                          <p>No activity yet.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {topOutlets.map((outlet, index) => (
                            <div key={outlet.id} className="flex items-center justify-between p-6 hover:bg-muted/40 transition-colors">
                              <div className="flex flex-col gap-1 min-w-0">
                                <p className="font-semibold text-lg truncate flex items-center gap-2">
                                  {outlet.name}
                                  <Badge variant="secondary" className="text-xs">
                                    {outlet.count} trigger{outlet.count !== 1 ? 's' : ''}
                                  </Badge>
                                </p>
                                <p className="text-sm text-muted-foreground">ID: {outlet.id}</p>
                              </div>
                              <div className="text-sm text-muted-foreground text-right shrink-0">
                                <p>Latest Trigger</p>
                                <p className="font-medium text-foreground">
                                  {format(new Date(outlet.latestTimestamp), "MMM d, yyyy 'at' h:mm a")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Syncs Tab */}
              <TabsContent value="syncs">
                <Card className="border-white/10 shadow-md">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Sync Logs
                    </CardTitle>
                    <CardDescription>
                      Aggregated sync records for all restaurants.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {loadingSyncs ? (
                        <div className="p-6 space-y-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center space-x-4">
                              <Skeleton className="h-10 w-10 rounded-md" />
                              <div className="space-y-2 flex-1">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-3 w-32" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : syncs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                          <p>No sync records found.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {syncs.map((sync) => (
                            <div key={sync._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-muted/40 transition-colors gap-4">
                              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                  <p className="font-semibold text-lg truncate">
                                    {sync.restaurantName || sync.accountName || `Restaurant ID: ${sync.resId}`}
                                  </p>
                                  <Badge 
                                    variant={sync.status === 'completed' ? 'default' : sync.status === 'failed' ? 'destructive' : 'secondary'}
                                    className={sync.status === 'completed' ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-200' : ''}
                                  >
                                    {sync.status?.toUpperCase() || 'PENDING'}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                  <span>Res ID: {sync.resId}</span>
                                  <span className="hidden sm:inline">•</span>
                                  <span>Sync ID: {sync.syncId}</span>
                                  {sync.accountName && (
                                    <>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-foreground">Account: {sync.accountName}</span>
                                    </>
                                  )}
                                  {sync.taskId && (
                                    <>
                                      <span className="hidden sm:inline">•</span>
                                      <span className="font-medium text-blue-600 dark:text-blue-400">Task ID: {sync.taskId}</span>
                                    </>
                                  )}
                                </div>
                                {sync.error && (
                                  <p className="text-sm text-destructive mt-1 bg-destructive/10 p-2 rounded-md border border-destructive/20">
                                    {sync.error}
                                  </p>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground sm:text-right shrink-0">
                                <p>{format(new Date(sync.createdAt), "MMM d, yyyy")}</p>
                                <p className="font-medium text-foreground">
                                  {format(new Date(sync.createdAt), "h:mm a")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Triggers Tab */}
              <TabsContent value="triggers">
                <Card className="border-white/10 shadow-md">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Trigger History
                    </CardTitle>
                    <CardDescription>
                      All manual menu triggers recorded on both platforms.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[500px]">
                      {loadingTriggers ? (
                        <div className="p-6 space-y-4">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center space-x-4">
                              <Skeleton className="h-10 w-10 rounded-md" />
                              <div className="space-y-2 flex-1">
                                <Skeleton className="h-4 w-[250px]" />
                                <Skeleton className="h-3 w-32" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : triggers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                          <p>No trigger records found.</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {triggers.map((trigger) => (
                            <div key={trigger._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 hover:bg-muted/40 transition-colors gap-4">
                              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                  <p className="font-semibold text-lg truncate">
                                    Res ID: {trigger.resId}
                                  </p>
                                  <Badge 
                                    variant={trigger.status === 'SUCCESS' ? 'default' : 'destructive'}
                                    className={trigger.status === 'SUCCESS' ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-200' : ''}
                                  >
                                    {trigger.status}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                  <span className="px-2 py-0.5 bg-secondary rounded-md text-xs font-medium">
                                    {trigger.platform?.toUpperCase()}
                                  </span>
                                  <span className="hidden sm:inline">•</span>
                                  <span className="font-medium text-blue-600 dark:text-blue-400">Task ID: {trigger.taskId}</span>
                                </div>
                                {trigger.error && (
                                  <p className="text-sm text-destructive mt-1 bg-destructive/10 p-2 rounded-md border border-destructive/20">
                                    {trigger.error}
                                  </p>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground sm:text-right shrink-0">
                                <p>{format(new Date(trigger.createdAt), "MMM d, yyyy")}</p>
                                <p className="font-medium text-foreground">
                                  {format(new Date(trigger.createdAt), "h:mm a")}
                                </p>
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
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
