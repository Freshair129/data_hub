
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPrisma } from '../src/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function inspectMessageSenders() {
    const prisma = await getPrisma();
    if (!prisma) {
        console.error('Database connection failed');
        process.exit(1);
    }

    try {
        const threadId = '563835357';
        console.log(`Inspecting all messages in thread ${threadId}...`);

        const conv = await prisma.conversation.findUnique({
            where: { conversationId: threadId },
            include: { messages: true }
        });

        if (!conv) {
            console.log('Conversation not found in DB');
            return;
        }

        console.log(`Participant ID (Customer): ${conv.participantId}`);
        console.log('--- MESSAGES ---');
        conv.messages.forEach(m => {
            console.log(`- From: ${m.fromName} (${m.fromId}) | Content: ${m.content?.substring(0, 50)}`);
        });

    } catch (error) {
        console.error('Error fetching messages:', error);
    } finally {
        await prisma.$disconnect();
    }
}

inspectMessageSenders();
