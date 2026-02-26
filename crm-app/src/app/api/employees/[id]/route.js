import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { writeCacheEntry } from '@/lib/cacheSync';

export async function PUT(request, { params }) {
    try {
        const { id } = params;
        const data = await request.json();

        const prisma = await getPrisma();
        if (!prisma) {
            throw new Error('Prisma not available');
        }

        // 1. Update Database
        const updated = await prisma.employee.update({
            where: { employeeId: id },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                nickName: data.nickName,
                role: data.role,
                department: data.department,
                status: data.status,
                email: data.email,
                phonePrimary: data.phonePrimary,
                lineId: data.lineId,
                facebookName: data.facebookName,
                lineName: data.lineName,
                permissions: data.permissions || {},
                metadata: data.metadata
            }
        });

        // 2. Sync with Cache
        writeCacheEntry('employee', id, updated);

        return NextResponse.json({ success: true, data: updated });

    } catch (error) {
        console.error('Employee Update API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = params;
        const prisma = await getPrisma();

        if (!prisma) {
            throw new Error('Prisma not available');
        }

        // 1. Delete from Database
        await prisma.employee.delete({
            where: { employeeId: id }
        });

        // 2. Invalidate/Delete from Cache
        const { invalidateCacheEntry } = await import('@/lib/cacheSync');
        invalidateCacheEntry('employee', id);

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Employee Delete API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
