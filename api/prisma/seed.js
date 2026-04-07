import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin12345', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'chioma@fresheggs.com' },
    update: {},
    create: {
      email: 'chioma@fresheggs.com',
      passwordHash: adminPassword,
      firstName: 'Chioma',
      lastName: 'Ifeanyi-Eze',
      role: 'ADMIN',
      phone: '+234000000000',
    },
  });
  console.log(`  ✓ Admin user: ${admin.email}`);

  // Create manager user
  const mgrPassword = await bcrypt.hash('manager12345', 12);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@fresheggs.com' },
    update: {},
    create: {
      email: 'manager@fresheggs.com',
      passwordHash: mgrPassword,
      firstName: 'Manager',
      lastName: 'Fresh Eggs',
      role: 'MANAGER',
    },
  });
  console.log(`  ✓ Manager user: ${manager.email}`);

  // Create 3 bank accounts
  const accounts = [
    { name: 'Customer Deposit Account', accountType: 'CUSTOMER_DEPOSIT', lastFour: '0010' },
    { name: 'Sales Account', accountType: 'SALES', lastFour: '0020' },
    { name: 'Profit Account', accountType: 'PROFIT', lastFour: '0030' },
  ];

  for (const acc of accounts) {
    await prisma.bankAccount.upsert({
      where: { id: acc.lastFour }, // Will fail on first run, so use create
      update: {},
      create: acc,
    });
    console.log(`  ✓ Bank account: ${acc.name}`);
  }

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
