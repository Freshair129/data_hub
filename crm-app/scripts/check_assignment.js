const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const LOG_FILE = '/Users/ideab/Desktop/data_hub/crm-app/scripts/assignment_result.log';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

async function main() {
    fs.writeFileSync(LOG_FILE, '--- START ---\n');
    const prisma = new PrismaClient();
    const convId = 't_10159997649326505';
    const pageId = '170707786504';
    
    try {
        log('Fetching conversation: ' + convId);
        const conv = await prisma.conversation.findUnique({ 
            where: { conversationId: convId }
        });
        
        if (!conv) {
            log('Conversation not found in DB.');
        } else {
            log('CONV FOUND: ' + JSON.stringify(conv, null, 2));
            
            log('Fetching messages for internal ID: ' + conv.id);
            const messages = await prisma.message.findMany({
                where: { conversationId: conv.id },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
            
            log('MESSAGES: ' + JSON.stringify(messages, null, 2));
        }

        log('Checking Audit Logs for target: ' + convId);
        const audits = await prisma.auditLog.findMany({
            where: { target: { contains: convId } },
            take: 10
        });
        log('AUDITS: ' + JSON.stringify(audits, null, 2));

    } catch (e) {
        log('ERROR: ' + e.message);
        log(e.stack);
    } finally {
        log('--- END ---');
        await prisma.$disconnect();
    }
}
main();
