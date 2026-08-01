import JobsTable from "@/components/global/jobs/jobs-table";

export default function JobsPage() {
    return (
        <div className="container mx-auto p-6 max-w-5xl">
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Jobs Dashboard</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage and resume your menu processing jobs.
                    </p>
                </div>
                
                <JobsTable />
            </div>
        </div>
    );
}
