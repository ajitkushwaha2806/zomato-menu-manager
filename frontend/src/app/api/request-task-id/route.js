import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import dbConnect from '@/lib/dbConnect';
import BypassTriggerRecord from '@/model/BypassTriggerRecord';

export async function POST(req) {
    try {
        const { resName, resId, userEmail, userName } = await req.json();

        if (!resId || !resName) {
            return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
        }

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
            `,
        };

        await transporter.sendMail(mailOptions);

        await dbConnect();
        await BypassTriggerRecord.create({
            resId,
            resName,
            requestedBy: userName || 'Unknown User',
            userEmail: userEmail || 'Unknown Email'
        });

        return NextResponse.json({ success: true, message: 'Request sent successfully' });
    } catch (error) {
        console.error("Error sending email:", error);
        return NextResponse.json({ success: false, message: 'Failed to send request email' }, { status: 500 });
    }
}
