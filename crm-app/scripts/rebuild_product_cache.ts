
import 'dotenv/config';
import { getPrisma } from '../src/lib/db';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '../cache/products');

async function rebuildProductCache() {
    console.log('🔄 Rebuilding Product Cache from DB...');

    const prisma = await getPrisma();
    if (!prisma) {
        console.error('❌ Failed to initialize Prisma');
        return;
    }

    try {
        const products = await prisma.product.findMany({
            where: { isActive: true }
        });

        console.log(`📦 Found ${products.length} active products in DB.`);

        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }

        // 🧹 Clean ALL existing .json files from category subdirs first
        for (const sub of ['courses', 'packages', 'cooking_eqt', 'store']) {
            const subPath = path.join(CACHE_DIR, sub);
            if (fs.existsSync(subPath)) {
                const oldFiles = fs.readdirSync(subPath).filter(f => f.endsWith('.json'));
                for (const f of oldFiles) fs.unlinkSync(path.join(subPath, f));
                console.log(`🧹 Cleared ${oldFiles.length} old files from ${sub}/`);
            }
        }

        const now = new Date().toISOString();
        const allIndex: Record<string, any> = {
            _cachedAt: now,
            _source: 'db',
            courses: [],
            packages: [],
            equipment: [],
            store: []
        };

        for (const p of products) {
            const payload = {
                _cachedAt: now,
                _source: 'db',
                ...p
            };

            const fileName = `${p.productId}.json`;
            let subDir = '';

            // Prioritize productId prefix, then fall back to category
            if (p.productId.startsWith('TVS-PKG')) {
                allIndex.packages.push(p);
                subDir = 'packages';
            } else if (p.productId.startsWith('TVS-EQ') || p.productId.startsWith('EQ-') || p.category === 'equipment') {
                allIndex.equipment.push(p);
                subDir = 'cooking_eqt';
            } else if (p.productId.startsWith('TVS-STORE') || p.category === 'store') {
                allIndex.store = allIndex.store || [];
                allIndex.store.push(p);
                subDir = 'store';
            } else {
                allIndex.courses.push(p);
                subDir = 'courses';
            }

            // Write ONLY to category subdir
            const subDirPath = path.join(CACHE_DIR, subDir);
            if (!fs.existsSync(subDirPath)) fs.mkdirSync(subDirPath, { recursive: true });
            fs.writeFileSync(path.join(subDirPath, fileName), JSON.stringify(payload, null, 2));
        }

        // Write __all__.json index (this stays in root)
        fs.writeFileSync(path.join(CACHE_DIR, '__all__.json'), JSON.stringify(allIndex, null, 2));

        // 🧹 Clean up stray .json files in root (except __all__.json)
        const rootFiles = fs.readdirSync(CACHE_DIR);
        let cleaned = 0;
        for (const f of rootFiles) {
            const fp = path.join(CACHE_DIR, f);
            if (f.endsWith('.json') && f !== '__all__.json' && fs.statSync(fp).isFile()) {
                fs.unlinkSync(fp);
                cleaned++;
            }
        }
        if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} stray files from root.`);

        console.log(`✨ Cache Rebuilt: ${products.length} items organized into category folders.`);

    } catch (err) {
        console.error('❌ Sync Error:', err);
    } finally {
        await prisma.$disconnect();
    }
}

rebuildProductCache();
