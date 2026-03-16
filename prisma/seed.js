import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.courierService.upsert({
    where: { name: 'pathao' },
    update: {},
    create: {
      name: 'pathao',
      displayName: 'Pathao',
      trackingUrlPattern: 'https://merchant.pathao.com/tracking?consignment_id={consignment_id}&phone={phone_number}',
      isActive: true,
    },
  });

  await prisma.courierService.upsert({
    where: { name: 'steadfast' },
    update: {},
    create: {
      name: 'steadfast',
      displayName: 'Steadfast',
      trackingUrlPattern: 'https://steadfast.com.bd/t/{tracking_code}',
      isActive: true,
    },
  });
  console.log('Seeding...');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());