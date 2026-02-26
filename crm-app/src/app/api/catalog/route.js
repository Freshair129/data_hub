import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const publicImagesDir = path.join(process.cwd(), 'public', 'images', 'products');

        // Helper to find image file in the new public directory
        const getImagePath = (id) => {
            const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
            for (const ext of extensions) {
                if (fs.existsSync(path.join(publicImagesDir, `${id}${ext}`))) {
                    return `/images/products/${id}${ext}`;
                }
            }
            return null;
        };

        const catalog = {
            packages: [],
            products: []
        };

        // 1. Fetch all products from DB (which falls back to cache if DB unavailable)
        const allProducts = await getAllProducts();

        // 2. Map DB schema to expected Catalog schema
        for (const item of allProducts) {
            // Map common fields to what the frontend expects
            const catalogItem = {
                id: item.productId,
                name: item.name,
                description: item.description,
                price: item.price,
                base_price: item.basePrice || item.base_price || 0, // Include cost data
                original_price: item.originalPrice,
                category: item.category,
                tags: item.tags || [],
                features: item.features || [],
                image: getImagePath(item.productId),
                created_at: item.createdAt,
                updated_at: item.updatedAt
            };

            // Categorize into packages vs products (courses/equipment)
            if (['bundle', 'package'].includes(item.category) || item.productId?.startsWith('TVS-PKG')) {
                // If it's a package, try to map included products if available
                catalogItem.included_products = item.includedProducts || [];
                catalog.packages.push(catalogItem);
            } else {
                // Determine difficulty level if it's a course
                catalogItem.level = item.metadata?.difficulty || 'All Levels';
                catalogItem.duration = item.metadata?.duration;
                catalog.products.push(catalogItem);
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
