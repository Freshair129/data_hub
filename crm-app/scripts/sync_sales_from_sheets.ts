import { fetchFromGoogleSheet } from '../src/lib/googleSheetsService.js';
import { getPrisma } from '../src/lib/db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Maps a row from Google Sheet to CRM Order/Transaction structure.
 * This should be adjusted based on the actual sheet columns.
 */
function mapSheetRowToOrder(row) {
    // Heuristic mapping for common column names in Thai/English
    const findValue = (keys) => {
        const key = Object.keys(row).find(k => keys.includes(k.toLowerCase()) || keys.some(target => k.toLowerCase().includes(target)));
        return row[key];
    };

    const phone = findValue(['phone', 'เบอร์', 'โทร', 'contact']);
    const amount = parseFloat(findValue(['amount', 'price', 'ยอด', 'ราคา', 'total']) || '0');
    const dateStr = findValue(['date', 'วัน', 'เวลา', 'timestamp']);
    const productName = findValue(['product', 'course', 'สินค้า', 'คอร์ส']);
    const fbName = findValue(['fb', 'facebook', 'messenger', 'ชื่อเฟส']);
    const rowStatus = findValue(['status', 'สถานะ']) || 'Paid';

    // Generate a deterministic unique ID if no external ID exists
    // Using simple hash-like string: Date_Phone_Product
    const dateNorm = dateStr ? new Date(dateStr).toISOString().slice(0, 10) : 'no-date';
    const phoneNorm = phone ? phone.toString().replace(/\D/g, '') : 'no-phone';
    const externalId = `GS-${dateNorm}-${phoneNorm}-${productName}`.replace(/\s+/g, '_');

    return {
        externalId,
        phone: phoneNorm !== 'no-phone' ? phoneNorm : null,
        fbName: fbName || null,
        amount,
        date: dateStr ? new Date(dateStr) : new Date(),
        productName: productName || 'Generic Product',
        status: rowStatus,
        rawData: row
    };
}

async function syncSales() {
    console.log('🚀 Starting Google Sheets Sales Sync...');

    const rows = await fetchFromGoogleSheet();
    if (rows.length === 0) {
        console.warn('⚠️ No data fetched from Google Sheets. Check GOOGLE_SHEETS_WEBHOOK_URL.');
        return;
    }

    console.log(`📊 Fetched ${rows.length} rows from Google Sheets.`);

    const prisma = await getPrisma();
    if (!prisma) {
        console.error('❌ Could not connect to database via Prisma.');
        return;
    }

    let syncedCount = 0;
    for (const row of rows) {
        const sale = mapSheetRowToOrder(row);

        if (!sale.amount || (!sale.phone && !sale.fbName)) {
            console.log(`  - Skipping invalid row: ${JSON.stringify(row)}`);
            continue;
        }

        try {
            // Find customer by phone or FB name
            let customer = null;
            if (sale.phone) {
                customer = await prisma.customer.findFirst({
                    where: { phonePrimary: { contains: sale.phone } }
                });
            }

            if (!customer && sale.fbName) {
                customer = await prisma.customer.findFirst({
                    where: { facebookName: { contains: sale.fbName, mode: 'insensitive' } }
                });
            }

            if (!customer) {
                console.warn(`  ⚠️ Customer not found for sale: ${sale.phone || sale.fbName}. Skipping.`);
                continue;
            }

            const orderStatus = (sale.status.toLowerCase().includes('cancel') || sale.status.toLowerCase().includes('ยกเลิก'))
                ? 'CANCELLED'
                : 'COMPLETED';

            // Upsert Order
            await prisma.order.upsert({
                where: { orderId: sale.externalId },
                update: {
                    status: orderStatus,
                    totalAmount: sale.amount,
                    paidAmount: sale.amount,
                    items: [{ name: sale.productName, price: sale.amount, quantity: 1 }]
                },
                create: {
                    orderId: sale.externalId,
                    customer: { connect: { id: customer.id } },
                    date: sale.date,
                    status: orderStatus,
                    totalAmount: sale.amount,
                    paidAmount: sale.amount,
                    items: [{ name: sale.productName, price: sale.amount, quantity: 1 }],
                    transactions: {
                        create: {
                            transactionId: `TX-${sale.externalId}`,
                            date: sale.date,
                            amount: sale.amount,
                            type: 'CREDIT',
                            method: 'GoogleSheets-Sync',
                            note: `Synced from Google Sheets: ${sale.productName}`
                        }
                    }
                }
            });

            // Update Timeline (Only if not already created for this sale)
            const existingEvent = await prisma.timelineEvent.findFirst({
                where: { eventId: `EV-${sale.externalId}` }
            });

            if (!existingEvent) {
                await prisma.timelineEvent.create({
                    data: {
                        eventId: `EV-${sale.externalId}`,
                        customer: { connect: { id: customer.id } },
                        date: sale.date,
                        type: orderStatus === 'CANCELLED' ? 'ORDER_CANCELLED' : 'PURCHASE',
                        summary: orderStatus === 'CANCELLED' ? `Cancelled: ${sale.productName}` : `Purchase: ${sale.productName}`,
                        details: { amount: sale.amount, source: 'GoogleSheets' }
                    }
                });
            }

            syncedCount++;
        } catch (err) {
            console.error(`  ❌ Failed to sync sale for ${sale.phone || sale.fbName}:`, err.message);
        }
    }

    console.log(`\n✨ Sync Completed! Total Sales Synced: ${syncedCount}`);
}

syncSales()
    .catch(console.error)
    .finally(async () => {
        const prisma = await getPrisma();
        if (prisma) await prisma.$disconnect();
    });
