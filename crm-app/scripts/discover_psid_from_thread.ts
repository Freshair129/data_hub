
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrisma } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function discoverPsidFromThread() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        const threadId = '540006679';
        console.log(`Searching for messages in thread ${threadId}...`);

        const conv = await prisma.conversation.findUnique({
            where: { conversationId: threadId },
            include: { messages: { orderBy: { timestamp: 'desc' }, take: 50 } }
        });

        if (!conv) {
            console.log('Conversation not found in DB');
            return;
        }

        console.log('Messages in thread:');
        const summary = conv.messages.map(m => ({
            name: m.fromName,
            id: m.fromId,
            content: m.content?.substring(0, 30)
        }));
        console.table(summary);

    } catch (error) {
        console.error('Error fetching messages:', error);
    } finally {
        await prisma.$disconnect();
    }
}

discoverPsidFromThread();
