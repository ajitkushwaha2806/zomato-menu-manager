import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import RestaurantOtp from "@/model/RestaurantOtp";
import BypassTriggerRecord from "@/model/BypassTriggerRecord";
import Menu from "@/model/menu";

export const dynamic = "force-dynamic";

const SECRET_UNLOCK_KEY = "142004312005";

export async function GET(req, { params }) {
    try {
        const { resId } = await params;
        if (!resId) {
            return NextResponse.json({ success: false, verified: false });
        }

        await dbConnect();

        // 1. Check if unlocked in the last 24 hours via RestaurantOtp
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const verifiedRecord = await RestaurantOtp.findOne({
            resId: String(resId),
            verified: true,
            verifiedAt: { $gte: twentyFourHoursAgo },
        }).sort({ verifiedAt: -1 });

        if (verifiedRecord) {
            return NextResponse.json({
                success: true,
                verified: true,
                verifiedAt: verifiedRecord?.verifiedAt || null,
            });
        }

        // 2. Check if a valid taskId exists on the Menu
        const menuWithTask = await Menu.findOne({
            resId: String(resId),
            taskId: { $exists: true, $ne: null, $ne: "" },
        });

        if (menuWithTask && menuWithTask.taskId) {
            return NextResponse.json({
                success: true,
                verified: true,
                taskId: menuWithTask.taskId,
                verifiedAt: menuWithTask.updatedAt || menuWithTask.createdAt,
            });
        }

        return NextResponse.json({
            success: true,
            verified: false,
        });
    } catch (error) {
        console.error("Error checking OTP status:", error);
        return NextResponse.json({ success: false, verified: false }, { status: 500 });
    }
}

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json().catch(() => ({}));
        const { otp, taskId, resName } = body;

        if (!resId || (!otp && !taskId)) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID and either OTP or Task ID are required." },
                { status: 400 }
            );
        }

        await dbConnect();

        // Handle Task ID verification
        if (taskId) {
            const cleanTaskId = String(taskId).trim();
            const crmRes = await fetch(`https://crm.magicscale.in/api/public-tasks/resid?taskId=${cleanTaskId}`);
            if (!crmRes.ok) {
                return NextResponse.json({ success: false, message: "Failed to validate Task ID with CRM." }, { status: 400 });
            }
            const crmData = await crmRes.json();
            if (!crmData.success || !crmData.data?.restIds) {
                return NextResponse.json({ success: false, message: "Invalid Task ID or no restaurants assigned." }, { status: 400 });
            }
            const assigned = crmData.data.restIds.some(id => String(id) === String(resId));
            if (!assigned) {
                return NextResponse.json({ success: false, message: "This Task ID is not assigned to this restaurant." }, { status: 400 });
            }

            await RestaurantOtp.create({
                resId: String(resId),
                resName: resName || "Restaurant",
                otp: "TASK_ID",
                requestedBy: `Task ID: ${cleanTaskId}`,
                verified: true,
                verifiedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            await Menu.findOneAndUpdate(
                { resId: String(resId) },
                { $set: { taskId: cleanTaskId } },
                { upsert: false }
            );

            return NextResponse.json({
                success: true,
                message: "Task ID verified successfully! Restaurant is unlocked.",
            });
        }

        const cleanOtp = String(otp).trim();

        // Check master secret key
        if (cleanOtp === SECRET_UNLOCK_KEY) {
            await RestaurantOtp.create({
                resId: String(resId),
                resName: resName || "Restaurant",
                otp: "SECRET_KEY",
                requestedBy: "Secret Key Unlock",
                verified: true,
                verifiedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            });

            try {
                await BypassTriggerRecord.create({
                    resId: String(resId),
                    resName: resName || "Restaurant",
                    requestedBy: "Secret Key Unlock",
                    userEmail: "",
                    reason: "Unlocked via Secret Key",
                    user: process.env.EMPLOYEE_NAME || process.env.USER || "Secret Key Verification",
                });
            } catch (logErr) {
                console.warn("Could not write BypassTriggerRecord:", logErr?.message);
            }

            return NextResponse.json({
                success: true,
                message: "Secret key verified! Restaurant is unlocked for triggering.",
            });
        }

        // Find the active pending OTP for this restaurant
        const activeOtpRecord = await RestaurantOtp.findOne({
            resId: String(resId),
            verified: false,
            expiresAt: { $gte: new Date() },
        }).sort({ createdAt: -1 });

        if (!activeOtpRecord) {
            return NextResponse.json(
                { success: false, message: "No active OTP found or OTP has expired. Please request a new OTP." },
                { status: 400 }
            );
        }

        if (activeOtpRecord.otp.trim() !== cleanOtp) {
            return NextResponse.json(
                { success: false, message: "Invalid OTP. Please check the email and try again." },
                { status: 400 }
            );
        }

        // Mark OTP as verified
        activeOtpRecord.verified = true;
        activeOtpRecord.verifiedAt = new Date();
        await activeOtpRecord.save();

        // Record bypass log
        try {
            await BypassTriggerRecord.create({
                resId: String(resId),
                resName: activeOtpRecord.resName || "Restaurant",
                requestedBy: activeOtpRecord.requestedBy || "Admin OTP User",
                userEmail: activeOtpRecord.userEmail || "",
                reason: "Unlocked via Admin Email OTP",
                user: process.env.EMPLOYEE_NAME || process.env.USER || "Admin OTP Verification",
            });
        } catch (logErr) {
            console.warn("Could not write BypassTriggerRecord:", logErr?.message);
        }

        return NextResponse.json({
            success: true,
            message: "OTP verified successfully! Restaurant is unlocked for triggering.",
        });
    } catch (error) {
        console.error("Error verifying OTP:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Error verifying OTP.",
            },
            { status: 500 }
        );
    }
}

