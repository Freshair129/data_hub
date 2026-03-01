/**
 * backfill_order_attribution.js
 *
 * One-time script: backfill Order.closedById and Order.conversationId
 * By finding the last admin message sent BEFORE the order date.
 *
 * Usage: node scripts/backfill_order_attribution.js
 */

import { PrismaClient } from '../src/generated/prisma-client/index.js';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pg;

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function main() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    console.log('[Backfill-Order] Starting Sales Attribution (REQ-03/04)...');

    // 1. Load active employees for logging/reference
    const employees = await prisma.employee.findMany();
    const empMap = new Map(employees.map(e => [e.id, e.nickname || e.firstName]));

    // 2. Load orders that need attribution
    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { closedById: null },
                { conversationId: null }
            ]
        },
        include: {
            customer: true
        },
        orderBy: { date: 'desc' }
    });

    console.log(`[Backfill-Order] Found ${orders.length} orders to process.`);

    let linkedCount = 0;
    let fallbackCount = 0;

    for (const order of orders) {
        if (!order.customer) {
            console.log(`  ⚠️ Order ${order.orderId} has no linked customer.`);
            continue;
        }

        const customerPsid = order.customer.facebookId;

        // Find the last admin message BEFORE the order date
        // We look for messages in ANY conversation belonging to this customer
        const lastAdminMsg = await prisma.message.findFirst({
            where: {
                conversation: { customerId: order.customer.id },
                createdAt: { lte: order.date },
                OR: [
                    { responderId: { not: null } },
                    { NOT: { fromId: customerPsid } }
                ]
            },
            orderBy: { createdAt: 'desc' },
            select: { conversationId: true, responderId: true, fromName: true }
        });

        if (lastAdminMsg) {
            let employeeId = lastAdminMsg.responderId;

            // If we have a conversationId but no responderId, try to resolve from conversation.assignedEmployeeId
            if (!employeeId && lastAdminMsg.conversationId) {
                const conv = await prisma.conversation.findUnique({
                    where: { id: lastAdminMsg.conversationId },
                    select: { assignedEmployeeId: true }
                });
                employeeId = conv?.assignedEmployeeId || null;
            }

            await prisma.order.update({
                where: { id: order.id },
                data: {
                    closedById: employeeId,
                    conversationId: lastAdminMsg.conversationId
                }
            });

            const empName = employeeId ? empMap.get(employeeId) : 'Unresolved';
            console.log(`  ✅ Order ${order.orderId} → Conv: ${lastAdminMsg.conversationId}, Admin: ${empName}`);
            linkedCount++;
        } else {
            // Fallback: search messages slightly AFTER the order date (sometimes timestamps are close)
            const margin = new Date(order.date.getTime() + 10 * 60 * 1000); // +10 mins
            const fallbackMsg = await prisma.message.findFirst({
                where: {
                    conversation: { customerId: order.customer.id },
                    createdAt: { lte: margin },
                    OR: [
                        { responderId: { not: null } },
                        { NOT: { fromId: customerPsid } }
                    ]
                },
                orderBy: { createdAt: 'desc' },
                select: { conversationId: true, responderId: true }
            });

            if (fallbackMsg) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: {
                        closedById: fallbackMsg.responderId,
                        conversationId: fallbackMsg.conversationId
                    }
                });
                console.log(`  ✅ Order ${order.orderId} → Linked via fallback (+10m margin)`);
                fallbackCount++;
                linkedCount++;
            } else {
                console.log(`  ❌ Order ${order.orderId} → Could not find any attribution.`);
            }
        }
    }

    console.log('\n========================================');
    console.log('[Backfill-Order] DONE');
    console.log(`  Total orders processed: ${orders.length}`);
    console.log(`  Successfully linked:    ${linkedCount}`);
    console.log(`  Included fallbacks:     ${fallbackCount}`);
    console.log('========================================');

    await prisma.$disconnect();
}

main().catch(async e => {
    console.error('[Backfill-Order] Fatal error:', e);
    process.exit(1);
});
