import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const productsDir = path.join(process.cwd(), 'public/data/products');
        const coursesDir = path.join(productsDir, 'courses');
        const packagesDir = path.join(productsDir, 'packages');

        const readProducts = (dir, type) => {
            if (!fs.existsSync(dir)) return [];
            const files = fs.readdirSync(dir).filter(file => file.endsWith('.json'));
            return files.map(file => {
                const filePath = path.join(dir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                try {
                    const data = JSON.parse(content);
                    return {
                        id: data.id || file.replace('.json', ''),
                        ...data,
                        type: type // 'course' or 'bundle'
                    };
                } catch (e) {
                    console.error(`Error parsing ${file}:`, e);
                    return null;
                }
            }).filter(Boolean);
        };

        const courses = readProducts(coursesDir, 'course');
        const packages = readProducts(packagesDir, 'bundle');

        return NextResponse.json({ courses, packages });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
