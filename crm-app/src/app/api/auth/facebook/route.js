import { NextResponse } from 'next/server';
import { getEmployeeByFacebookId } from '@/lib/db';

export async function POST(request) {
    try {
        const { facebookId, facebookName } = await request.json();

        if (!facebookId) {
            return NextResponse.json({ error: 'Missing facebookId' }, { status: 400 });
        }

        // Find employee by facebookId via centralized DB helper
        const employee = await getEmployeeByFacebookId(facebookId);

        if (!employee && facebookName) {
            // Optional: If not found but we have a name, maybe we should log this 
            // or allow linking if the user is already authenticated via email.
            // For now, we only allow login if already linked.
            return NextResponse.json({
                success: false,
                error: 'Facebook account not linked to any employee'
            }, { status: 404 });
        }

        if (employee) {
            const { passwordHash, permissions, metadata, ...safeData } = employee;
            return NextResponse.json({ success: true, user: safeData });
        }

        return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 401 });
    } catch (error) {
        console.error('POST /api/auth/facebook error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
