
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrisma } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function discoverAdminPsid() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        console.log('Searching for recent outbound messages to find admin PSID...');
        const messages = await prisma.message.findMany({
            where: { isOutbound: true },
            orderBy: { timestamp: 'desc' },
            take: 20
        });

        const uniqueSenders = new Map();
        messages.forEach(m => {
            if (m.senderId && !uniqueSenders.has(m.senderId)) {
                uniqueSenders.set(m.senderId, m.senderName);
            }
        });

        console.log('Recent Outbound Senders Found:');
        console.table(Array.from(uniqueSenders.entries()).map(([id, name]) => ({ id, name })));

    } catch (error) {
        console.error('Error fetching messages:', error);
    } finally {
        await prisma.$disconnect();
    }
}

discoverAdminPsid();
