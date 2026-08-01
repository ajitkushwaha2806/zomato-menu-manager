"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlayCircle, AlertCircle, Clock, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MenuService } from "@/services/menu";

export default function JobsTable() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [resumingId, setResumingId] = useState(null);

    const fetchJobs = async () => {
        setLoading(true);
        try {
            const data = await MenuService.getFailedJobs();
            setJobs(data);
        } catch (error) {
            toast.error(error.message || "Failed to load jobs");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
    }, []);

    const handleResume = async (jobId) => {
        setResumingId(jobId);
        try {
            await MenuService.resumeJob(jobId);
            toast.success("Job resumed successfully!");
            setJobs(jobs.filter(j => j.job_id !== jobId));
        } catch (error) {
            toast.error(error.message || "Failed to resume job");
        } finally {
            setResumingId(null);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "N/A";
        return new Date(dateStr).toLocaleString();
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    Failed Upload Jobs
                </CardTitle>
                <CardDescription>
                    Review and resume menu upload jobs that encountered errors during processing.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                ) : jobs.length === 0 ? (
                    <div className="text-center p-8 text-muted-foreground border border-dashed rounded-lg">
                        No failed jobs found. Everything is running smoothly!
                    </div>
                ) : (
                    <div className="space-y-4">
                        {jobs.map((job) => (
                            <div 
                                key={job.job_id} 
                                className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/20"
                            >
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="font-mono text-xs">
                                            {job.job_id}
                                        </Badge>
                                        <Badge variant={job.job_type === "PRICE_UPDATE" ? "secondary" : "default"}>
                                            {job.job_type?.replace("_", " ")}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground font-medium bg-background px-2 py-0.5 rounded-full border">
                                            Res: {job.restaurant_id}
                                        </span>
                                    </div>
                                    
                                    <div className="flex items-start gap-2 mt-2 bg-destructive/10 text-destructive p-2.5 rounded-md text-sm font-medium">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        <p className="leading-tight break-all">{job.error || "Unknown error occurred"}</p>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                                        <div className="flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {job.upload_type === "TEXT" ? "Raw Text" : `${job.total_files || 0} Files`}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Failed at: {formatDate(job.created_at)}
                                        </div>
                                        {job.step && (
                                            <div className="flex items-center gap-1 font-medium">
                                                Last Step: {job.step} ({job.progress || 0}%)
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center shrink-0">
                                    <Button 
                                        onClick={() => handleResume(job.job_id)}
                                        disabled={resumingId === job.job_id}
                                        className="w-full md:w-auto"
                                    >
                                        {resumingId === job.job_id ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Resuming...
                                            </>
                                        ) : (
                                            <>
                                                <PlayCircle className="w-4 h-4 mr-2" />
                                                Resume Job
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
