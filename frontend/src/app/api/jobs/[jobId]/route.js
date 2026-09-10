import dbConnect from "@/lib/dbConnect";
import MenuUploadJob from "@/model/menu-upload-job";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
    try {
        await dbConnect();
        const { jobId } = await params;

        if (!jobId) {
            return NextResponse.json(
                { success: false, message: "Job ID is required" },
                { status: 400 }
            );
        }

        const job = await MenuUploadJob.findOne({
            $or: [{ job_id: jobId }, { _id: jobId.match(/^[0-9a-fA-F]{24}$/) ? jobId : null }],
        }).lean();

        if (!job) {
            return NextResponse.json(
                { success: false, message: "Job not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                ...job,
                _id: job._id?.toString(),
            },
        });
    } catch (error) {
        console.error("Error fetching job details:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to fetch job" },
            { status: 500 }
        );
    }
}

export async function DELETE(request, { params }) {
    try {
        await dbConnect();
        const { jobId } = await params;

        if (!jobId) {
            return NextResponse.json(
                { success: false, message: "Job ID is required" },
                { status: 400 }
            );
        }

        const deleted = await MenuUploadJob.findOneAndDelete({
            $or: [{ job_id: jobId }, { _id: jobId.match(/^[0-9a-fA-F]{24}$/) ? jobId : null }],
        });

        if (!deleted) {
            return NextResponse.json(
                { success: false, message: "Job not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Job deleted successfully",
            data: { job_id: jobId },
        });
    } catch (error) {
        console.error("Error deleting job:", error);
        return NextResponse.json(
            { success: false, message: error?.message || "Failed to delete job" },
            { status: 500 }
        );
    }
}
