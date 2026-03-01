import { getPrisma } from './src/lib/db.js';

async function seedTestOrders() {
    try {
        const prisma = await getPrisma();
        if (!prisma) {
            console.log('Prisma adapter failed to initialize.');
            return;
        }

        console.log('Fetching customers...');
        // Find 5 random customers who exist in the DB
        const customers = await prisma.customer.findMany({
            take: 5
        });

        if (customers.length === 0) {
            console.log('No customers found in DB!');
            return;
        }

        console.log(`Found ${customers.length} customers. Seeding test orders...`);
        let generatedRevenue = 0;

        for (const c of customers) {
            // Create 1-3 random orders per customer
            const numOrders = Math.floor(Math.random() * 3) + 1;

            for (let i = 0; i < numOrders; i++) {
                const amount = Math.floor(Math.random() * 5000) + 1000; // Between 1000 and 6000
                generatedRevenue += amount;

                await prisma.order.create({
                    data: {
                        id: `TEST-ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                        orderId: `ODR-${Date.now()}`,
                        customerId: c.id,
                        totalAmount: amount,
                        paidAmount: amount,
                        status: 'COMPLETED',
                        createdAt: new Date(),
                        date: new Date()
                    }
                });
            }

            // Update the Intelligence JSON field to reflect the spend
            let intelligence = c.intelligence || {};
            if (!intelligence.metrics) intelligence.metrics = {};

            const currentSpend = intelligence.metrics.total_spend || 0;
            const currentOrders = intelligence.metrics.total_order || 0;

            intelligence.metrics.total_spend = currentSpend + generatedRevenue;
            intelligence.metrics.total_order = currentOrders + numOrders;

            await prisma.customer.update({
                where: { id: c.id },
                data: { intelligence }
            });

            console.log(`Seeded orders for ${c.firstName} ${c.lastName}: Total Spend now ${intelligence.metrics.total_spend}`);
            generatedRevenue = 0; // reset for next customer
        }

        console.log('✅ Seed complete. Dashboard should now show real revenue.');
    } catch (e) {
        console.error('Seed Error:', e);
    } finally {
        process.exit(0);
    }
}

seedTestOrders();
