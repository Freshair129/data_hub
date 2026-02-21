const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Search Results ---');
  try {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { firstName: { contains: 'กรณัฐฏ์' } },
          { lastName: { contains: 'กรณัฐฏ์' } },
          { phonePrimary: { contains: '0825525459' } },
          { customerId: { contains: 'Pk5' } },
          { nickName: { contains: 'Pk5' } }
        ]
      },
      include: {
        orders: true,
        conversations: true
      }
    });
    console.log(JSON.stringify(customers, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
