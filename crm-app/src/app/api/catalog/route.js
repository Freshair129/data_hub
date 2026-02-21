import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const productsDir = path.join(process.cwd(), '..', 'products');

        // Helper to find image file
        const getImagePath = (id) => {
            const packagesPicDir = path.join(productsDir, 'packages_picture');
            const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
            for (const ext of extensions) {
                if (fs.existsSync(path.join(packagesPicDir, `${id}${ext}`))) {
                    return `/images/packages/${id}${ext}`;
                }
            }
            return null;
        };

        if (!fs.existsSync(productsDir)) {
            // Fallback to old behavior if products dir doesn't exist (safety check)
            const catalogPath = path.join(process.cwd(), '..', 'catalog.json');
            if (fs.existsSync(catalogPath)) {
                const fileContent = fs.readFileSync(catalogPath, 'utf8');
                return NextResponse.json(JSON.parse(fileContent));
            }
            return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
        }

        const catalog = {
            packages: [],
            products: []
        };

        // Read Packages
        const packagesDir = path.join(productsDir, 'packages');
        if (fs.existsSync(packagesDir)) {
            const files = fs.readdirSync(packagesDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(packagesDir, file), 'utf8'));
                    data.image = getImagePath(data.id);
                    catalog.packages.push(data);
                } catch (e) {
                    console.error(`Error reading package ${file}:`, e);
                }
            }
        }

        // Read Courses (Products)
        const coursesDir = path.join(productsDir, 'courses');
        if (fs.existsSync(coursesDir)) {
            const files = fs.readdirSync(coursesDir).filter(f => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(coursesDir, file), 'utf8'));
                    data.image = getImagePath(data.id);
                    catalog.products.push(data);
                } catch (e) {
                    console.error(`Error reading course ${file}:`, e);
                }
            }
        }

        // Sort by ID to ensure consistent order
        catalog.packages.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
        catalog.products.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

        return NextResponse.json(catalog);
    } catch (error) {
        console.error('Error reading catalog:', error);
        return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 });
    }
}
