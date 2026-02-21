import { NextResponse } from 'next/server';
import { getEmployeeByEmail } from '@/lib/db';

export async function POST(request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
        }

        const user = await getEmployeeByEmail(email);

        if (user) {
            // Support both passwordHash (modern) and credentials.password (legacy)
            const storedPassword = user.passwordHash || user.credentials?.password || user.password;

            if (storedPassword === password) {
                const { passwordHash, credentials, password: _, ...safeData } = user;
                return NextResponse.json({ success: true, user: safeData });
            }
        }

        return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    } catch (error) {
        console.error('POST /api/auth/login error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
