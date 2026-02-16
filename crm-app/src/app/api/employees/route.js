import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const EMPLOYEE_DIR = path.join(process.cwd(), '../employee');

export async function GET() {
    try {
        if (!fs.existsSync(EMPLOYEE_DIR)) {
            return NextResponse.json([]);
        }

        const folders = fs.readdirSync(EMPLOYEE_DIR).filter(f =>
            fs.statSync(path.join(EMPLOYEE_DIR, f)).isDirectory()
        );

        const employees = folders.map(folder => {
            // Find any json file in the folder (e.g., profile_e01.json)
            const files = fs.readdirSync(path.join(EMPLOYEE_DIR, folder)).filter(f => f.endsWith('.json'));
            if (files.length > 0) {
                const filePath = path.join(EMPLOYEE_DIR, folder, files[0]);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Security: Strip credentials before sending to client
                const { credentials, ...safeData } = data;
                return { id: folder, ...safeData };
            }
            return null;
        }).filter(Boolean);

        return NextResponse.json(employees);
    } catch (error) {
        console.error('GET /api/employees error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
