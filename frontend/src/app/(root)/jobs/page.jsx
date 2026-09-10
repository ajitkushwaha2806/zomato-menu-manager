import JobsTable from "@/components/global/jobs/jobs-table";
import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JobsPage() {
    return (
        <div className="min-h-screen bg-slate-50/50 py-8 px-4 sm:px-6">
            <div className="container mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
                            <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
                                <Layers className="w-3.5 h-3.5" />
                                Menu Editor
                            </Link>
                            <span>/</span>
                            <span className="text-foreground">Processing Queues</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                            Queue & Processing Manager
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Review AI menu extractions and append parsed items into any restaurant menu schema.
                        </p>
                    </div>

                    <Link href="/">
                        <Button variant="outline" className="gap-2 font-semibold">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Menu Editor
                        </Button>
                    </Link>
                </div>

                <JobsTable />
            </div>
        </div>
    );
}
