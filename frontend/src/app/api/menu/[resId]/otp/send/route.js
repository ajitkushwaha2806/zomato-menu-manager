import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import dbConnect from "@/lib/dbConnect";
import RestaurantOtp from "@/model/RestaurantOtp";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
    try {
        const { resId } = await params;
        const body = await req.json().catch(() => ({}));
        const { resName, userName, userEmail } = body;

        if (!resId) {
            return NextResponse.json(
                { success: false, message: "Restaurant ID is required." },
                { status: 400 }
            );
        }

        await dbConnect();

        // 1. Generate 6-digit random OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // 2. Clear any pending unverified OTPs for this restaurant
        await RestaurantOtp.deleteMany({ resId: String(resId), verified: false });

        // 3. Save new OTP to database
        await RestaurantOtp.create({
            resId: String(resId),
            resName: resName || "Restaurant",
            otp,
            requestedBy: userName || "Menu Manager User",
            userEmail: userEmail || "",
            expiresAt,
            verified: false,
        });

        // 4. Send Email to vishalkushwaha@magicscale.in
        const recipients = ["vishalkushwaha@magicscale.in"];

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });

        const mailHtml = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="color: #1e293b; margin: 0; font-size: 20px;">🔒 Menu Manager - Trigger Authorization OTP</h2>
                </div>
                
                <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
                    An authorization OTP was requested to unlock menu triggering for:
                </p>
                
                <div style="background-color: #f8fafc; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 6px;">
                    <p style="margin: 4px 0; font-size: 13px; color: #334155;"><strong>Restaurant Name:</strong> ${resName || "Unknown"}</p>
                    <p style="margin: 4px 0; font-size: 13px; color: #334155;"><strong>Restaurant ID:</strong> ${resId}</p>
                    ${userName ? `<p style="margin: 4px 0; font-size: 13px; color: #334155;"><strong>Requested By:</strong> ${userName}</p>` : ""}
                    <p style="margin: 4px 0; font-size: 13px; color: #334155;"><strong>Requested At:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
                </div>

                <div style="text-align: center; margin: 28px 0; padding: 20px; background: #f5f3ff; border-radius: 10px; border: 1px dashed #a855f7;">
                    <p style="font-size: 11px; color: #7c3aed; text-transform: uppercase; font-weight: 700; letter-spacing: 1.5px; margin: 0 0 8px 0;">Your Verification OTP</p>
                    <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #581c87; font-family: monospace;">
                        ${otp}
                    </div>
                    <p style="font-size: 12px; color: #dc2626; margin: 8px 0 0 0; font-weight: 500;">⏱️ Valid for 10 minutes only</p>
                </div>

                <p style="color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px;">
                    Enter this OTP in the Menu Manager trigger popup to authorize triggering. If you did not request this, you can safely ignore this email.
                </p>
            </div>
        `;

        await transporter.sendMail({
            from: process.env.SMTP_USER || '"Menu Manager" <no-reply@magicscale.in>',
            to: recipients.join(", "),
            subject: `[OTP: ${otp}] Authorize Trigger for ${resName || "Restaurant"} (${resId})`,
            html: mailHtml,
            text: `Your OTP to unlock triggering for ${resName || "Restaurant"} (${resId}) is ${otp}. Valid for 10 minutes.`,
        });

        console.log(`[OTP] Sent OTP ${otp} for restaurant ${resId} to ${recipients.join(", ")}`);

        return NextResponse.json({
            success: true,
            message: "OTP sent to vishalkushwaha@magicscale.in",
        });
    } catch (error) {
        console.error("Error sending OTP email:", error);
        return NextResponse.json(
            {
                success: false,
                message: error?.message || "Failed to send OTP email.",
            },
            { status: 500 }
        );
    }
}

