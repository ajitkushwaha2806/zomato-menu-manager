import { NextResponse } from 'next/server';

const SECRET_UNLOCK_KEY = '142004312005';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
        return NextResponse.json({ success: false, message: 'Missing taskId' }, { status: 400 });
    }

    if (String(taskId).trim() === SECRET_UNLOCK_KEY) {
        return NextResponse.json({
            success: true,
            isSecretKey: true,
            data: { isSecretKey: true, restIds: [] },
        });
    }

    try {
        const res = await fetch(`https://crm.magicscale.in/api/public-tasks/resid?taskId=${taskId}`);
        
        if (!res.ok) {
            return NextResponse.json({ success: false, message: 'Failed to fetch from CRM' }, { status: res.status });
        }
        
        const data = await res.json();
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Error validating task ID with CRM:", error);
        return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }
}
