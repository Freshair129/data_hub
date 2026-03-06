
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Find messages that have a responderId or assignedEmployeeId
    // Or messages that have 'Sent by' names captured in some metadata (if we stored it)
    // Actually, we can check the 'responderId' count per name

    // We don't store the scraped name directly in the Message model, 
    // but we used it in the API to find the responderId.

    // Let's count messages grouped by responderId
    const responderCounts = await prisma.message.groupBy({
        by: ['responderId'],
        _count: {
            id: true
        }
    });

    console.log('--- Responder Counts ---');
    for (const rc of responderCounts) {
        if (rc.responderId) {
            const emp = await prisma.employee.findUnique({ where: { id: rc.responderId } });
            console.log(`${emp ? emp.name : 'Unknown'} (${rc.responderId}): ${rc._count.id}`);
        } else {
            console.log(`Unmapped (null): ${rc._count.id}`);
        }
    }

    // Check assignedEmployeeId on Conversations
    const convCounts = await prisma.conversation.groupBy({
        by: ['assignedEmployeeId'],
        _count: {
            id: true
        }
    });

    console.log('\n--- Conversation Assigned Employee Counts ---');
    for (const cc of convCounts) {
        if (cc.assignedEmployeeId) {
            const emp = await prisma.employee.findUnique({ where: { id: cc.assignedEmployeeId } });
            console.log(`${emp ? emp.name : 'Unknown'} (${cc.assignedEmployeeId}): ${cc._count.id}`);
        } else {
            console.log(`Unassigned (null): ${cc._count.id}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
