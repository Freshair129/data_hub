
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrisma } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function discoverAdminPsids() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        console.log('Searching for non-participant senders (Admins/Page)...');

        // Query many messages with their conversations
        const messages = await prisma.message.findMany({
            take: 200,
            orderBy: { createdAt: 'desc' },
            include: { conversation: true }
        });

        const adminCandidates = new Map();

        for (const msg of messages) {
            const participantId = msg.conversation.participantId;
            if (msg.fromId && msg.fromId !== participantId) {
                if (!adminCandidates.has(msg.fromId)) {
                    adminCandidates.set(msg.fromId, {
                        id: msg.fromId,
                        name: msg.fromName,
                        totalMessages: 0
                    });
                }
                adminCandidates.get(msg.fromId).totalMessages++;
            }
        }

        console.log('--- POTENTIAL ADMIN/PAGE PSIDs ---');
        console.table(Array.from(adminCandidates.values()).sort((a, b) => b.totalMessages - a.totalMessages));
        console.log('---------------------------------');

    } catch (error) {
        console.error('Error discovering PSIDs:', error);
    } finally {
        await prisma.$disconnect();
    }
}

discoverAdminPsids();
