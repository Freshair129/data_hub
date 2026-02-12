import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../customer');

export async function GET() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            return NextResponse.json([], { status: 200 });
        }

        const folders = fs.readdirSync(DATA_DIR).filter(f =>
            fs.statSync(path.join(DATA_DIR, f)).isDirectory()
        );

        const customers = folders.map(id => {
            const filePath = path.join(DATA_DIR, id, `profile_${id}.json`);
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            return null;
        }).filter(Boolean);

        return NextResponse.json(customers);
    } catch (error) {
        console.error('GET /api/customers error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const customer = await request.json();
        const id = customer.customer_id;

        if (!id) return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 });

        const customerDir = path.join(DATA_DIR, id);
        if (!fs.existsSync(customerDir)) {
            fs.mkdirSync(customerDir, { recursive: true });
        }

        const filePath = path.join(customerDir, `profile_${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(customer, null, 4));

        return NextResponse.json({ success: true, customer });
    } catch (error) {
        console.error('POST /api/customers error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
