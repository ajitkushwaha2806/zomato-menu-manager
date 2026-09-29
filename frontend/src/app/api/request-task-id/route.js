import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import dbConnect from '@/lib/dbConnect';
import BypassTriggerRecord from '@/model/BypassTriggerRecord';

export async function GET(req) {
    try {
        const url = new URL(req.url);
        const resId = url.searchParams.get('resId');
        if (!resId) {
            return NextResponse.json({ success: false, message: 'Missing resId' }, { status: 400 });
        }

        await dbConnect();
        const record = await BypassTriggerRecord.findOne({ resId }).sort({ createdAt: -1 });
        if (record) {
            return NextResponse.json({ success: true, data: record });
        } else {
            return NextResponse.json({ success: false, message: 'No record found' });
        }
    } catch (error) {
        console.error("Error fetching bypass record:", error);
        return NextResponse.json({ success: false, message: 'Error processing request' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { resName, resId, userEmail, userName, reason } = await req.json();

        if (!resId || !resName) {
            return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
        }

        await dbConnect();
        
        try {
            await BypassTriggerRecord.create({
                resId,
                resName,
                requestedBy: userName || 'Unknown User',
                userEmail: userEmail || 'Unknown Email',
                reason: reason || 'No reason provided',
                user: process.env.EMPLOYEE_NAME || process.env.USER || 'Unknown System'
            });
        } catch (dbError) {
            console.error("Error saving bypass record to DB:", dbError);
        }

        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });

            const mailOptions = {
                from: process.env.SMTP_USER || '"Menu Manager" <no-reply@magicscale.in>',
                to: 'ajitkushwahacse@gmail.com, akashverma32000@gmail.com',
                subject: `Task ID Request for ${resName} (${resId})`,
                text: `
A user has triggered a menu without a Task ID. Please check if this is our customer.

Restaurant Name: ${resName}
Restaurant ID: ${resId}
Requested By: ${userName || 'Unknown User'}
Reason: ${reason || 'No reason provided'}
                `,
            };

            await transporter.sendMail(mailOptions);
        } catch (emailError) {
            console.error("Error sending email:", emailError);
        }

        return NextResponse.json({ success: true, message: 'Request sent successfully' });
    } catch (error) {
        console.error("Error processing request:", error);
        // Even if there's an unexpected error, return success so we don't block the frontend trigger
        return NextResponse.json({ success: true, message: 'Processed with errors' });
    }
}
