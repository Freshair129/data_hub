import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { writeCacheEntry } from '@/lib/cacheSync';

export async function PUT(request, { params }) {
    try {
        const { id } = params; // This is now employeeCode
        const data = await request.json();

        const prisma = await getPrisma();
        if (!prisma) throw new Error('Prisma not available');

        // Fetch current to merge identities
        const current = await prisma.employee.findUnique({
            where: { employeeCode: id }
        });

        if (!current) {
            return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 });
        }

        // Merge identities
        const newIdentities = {
            ...(current.identities || {}),
            facebook: {
                ...(current.identities?.facebook || {}),
                name: data.facebookName || current.identities?.facebook?.name
            },
            line: {
                ...(current.identities?.line || {}),
                id: data.lineName || current.identities?.line?.id
            }
        };

        const updated = await prisma.employee.update({
            where: { employeeCode: id },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                nickName: data.nickName,
                role: data.role,
                department: data.department,
                status: data.status,
                email: data.email,
                phone: data.phonePrimary || data.phone,
                identities: newIdentities,
                permissions: data.permissions || [],
                settings: data.settings || current.settings,
                metadata: data.metadata || current.metadata
            }
        });

        return NextResponse.json({ success: true, data: updated });

    } catch (error) {
        console.error('Employee Update API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const { id } = params; // employeeCode
        const prisma = await getPrisma();
        if (!prisma) throw new Error('Prisma not available');

        await prisma.employee.delete({
            where: { employeeCode: id }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Employee Delete API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
