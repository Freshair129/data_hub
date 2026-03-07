
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'customer');

function searchCacheForAdmin() {
    console.log('Searching local cache for "Boss", "Pornpon", or admin identifiers...');
    if (!fs.existsSync(CACHE_DIR)) {
        console.log('Cache directory not found');
        return;
    }

    const folders = fs.readdirSync(CACHE_DIR).filter(f => !f.startsWith('.'));
    for (const folder of folders) {
        const historyDir = path.join(CACHE_DIR, folder, 'chathistory');
        if (fs.existsSync(historyDir)) {
            const files = fs.readdirSync(historyDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const content = JSON.parse(fs.readFileSync(path.join(historyDir, file), 'utf8'));
                        const messages = content.messages?.data || [];
                        for (const msg of messages) {
                            if (msg.from && (msg.from.name === 'Pornpon' || msg.from.name === 'Boss' || msg.from.name === 'The V School' || msg.from.name?.includes('Pornpon') || msg.from.name?.includes('Boss'))) {
                                console.log(`Found sender "${msg.from.name}" with PSID/ID: ${msg.from.id} in ${file}`);
                            }
                        }
                    } catch (e) {
                        // ignore parse errors
                    }
                }
            }
        }
    }
    console.log('Search complete.');
}

searchCacheForAdmin();
