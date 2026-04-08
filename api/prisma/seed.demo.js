import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PORTAL_PASSWORD = 'demo12345';
const DEMO_STAFF_PASSWORD = 'staff12345';
const MANAGER_PASSWORD = 'manager12345';
const SALT_ROUNDS = 12;

const DEMO_USER_EMAILS = [
  'records@demo.fresheggs.local',
  'shopfloor@demo.fresheggs.local',
  'amina@demo.fresheggs.local',
  'kola@demo.fresheggs.local',
  'ngozi@demo.fresheggs.local',
  'blessing@demo.fresheggs.local',
  'mama.tunde@demo.fresheggs.local',
];

const DEMO_CUSTOMER_PHONES = [
  '0809000001',
  '0809000002',
  '0809000003',
  '0809000004',
  '0809000005',
  '0809000006',
  '0809000007',
  '0809000008',
  '0809000009',
  '0809000010',
];

const DEMO_BATCH_NAMES = [
  '18APR2026',
  '22APR2026',
  '03APR2026',
  '01APR2026',
  '20MAR2026',
];

const DEMO_IMPORT_FILENAMES = ['providus-demo-week1.csv'];

function dateAt(date, time = '09:00:00') {
  return new Date(`${date}T${time}.000Z`);
}

function splitName(name) {
  const parts = String(name).trim().split(/\s+/);
  return {
    firstName: parts[0] || name,
    lastName: parts.slice(1).join(' ') || parts[0] || name,
  };
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function weightedAverageCost(eggCodes) {
  const totalQty = eggCodes.reduce((sum, row) => sum + row.quantity, 0);
  const totalCost = eggCodes.reduce((sum, row) => sum + (row.quantity * row.costPrice), 0);
  return money(totalCost / totalQty);
}

function ensureSafeDemoTarget() {
  const url = process.env.DATABASE_URL || '';
  const allowed = (
    url.includes('fresh_eggs_staging')
    || url.includes('localhost')
    || url.includes('127.0.0.1')
  );

  if (!allowed) {
    throw new Error('Demo seed is only allowed for staging or local databases.');
  }
}

async function ensureBankAccount({ name, accountType, lastFour, bankName, isVirtual, supportsStatementImport, sortOrder }) {
  const existing = await prisma.bankAccount.findFirst({ where: { name } });
  if (existing) {
    return prisma.bankAccount.update({
      where: { id: existing.id },
      data: { accountType, lastFour, bankName, isVirtual, supportsStatementImport, sortOrder, isActive: true },
    });
  }

  return prisma.bankAccount.create({
    data: { name, accountType, lastFour, bankName, isVirtual, supportsStatementImport, sortOrder, isActive: true },
  });
}

async function ensureBaseSettings(adminUserId) {
  await prisma.appSetting.upsert({
    where: { key: 'OPERATIONS_POLICY' },
    update: {
      value: { targetProfitPerCrate: 500, crackAllowancePercent: 2 },
      updatedById: adminUserId,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
    create: {
      key: 'OPERATIONS_POLICY',
      value: { targetProfitPerCrate: 500, crackAllowancePercent: 2 },
      updatedById: adminUserId,
      description: 'Company-wide policy settings for batch profitability and crack monitoring.',
    },
  });

  await prisma.appSetting.upsert({
    where: { key: 'CUSTOMER_EGG_TYPES' },
    update: {
      value: [
        { key: 'REGULAR', label: 'Regular Size Eggs', shortLabel: 'Regular', isActive: true, sortOrder: 1 },
        { key: 'SMALL', label: 'Small Size Eggs', shortLabel: 'Small', isActive: true, sortOrder: 2 },
        { key: 'LARGE', label: 'Large Eggs', shortLabel: 'Large', isActive: false, sortOrder: 3 },
      ],
      updatedById: adminUserId,
      description: 'Customer-facing egg type labels and active states used in batches, bookings, sales, portal, and reports.',
    },
    create: {
      key: 'CUSTOMER_EGG_TYPES',
      value: [
        { key: 'REGULAR', label: 'Regular Size Eggs', shortLabel: 'Regular', isActive: true, sortOrder: 1 },
        { key: 'SMALL', label: 'Small Size Eggs', shortLabel: 'Small', isActive: true, sortOrder: 2 },
        { key: 'LARGE', label: 'Large Eggs', shortLabel: 'Large', isActive: false, sortOrder: 3 },
      ],
      updatedById: adminUserId,
      description: 'Customer-facing egg type labels and active states used in batches, bookings, sales, portal, and reports.',
    },
  });
}

async function clearExistingDemoData() {
  const demoCustomers = await prisma.customer.findMany({
    where: { phone: { in: DEMO_CUSTOMER_PHONES } },
    select: { id: true },
  });
  const demoCustomerIds = demoCustomers.map((row) => row.id);

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: DEMO_USER_EMAILS } },
        { phone: { in: DEMO_CUSTOMER_PHONES } },
        { email: { in: ['records@demo.fresheggs.local', 'shopfloor@demo.fresheggs.local'] } },
      ],
    },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((row) => row.id);

  const demoBatches = await prisma.batch.findMany({
    where: { name: { in: DEMO_BATCH_NAMES } },
    select: { id: true },
  });
  const demoBatchIds = demoBatches.map((row) => row.id);

  const demoBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { customerId: { in: demoCustomerIds } },
        { batchId: { in: demoBatchIds } },
      ],
    },
    select: { id: true },
  });
  const demoBookingIds = demoBookings.map((row) => row.id);

  const demoSales = await prisma.sale.findMany({
    where: {
      OR: [
        { customerId: { in: demoCustomerIds } },
        { batchId: { in: demoBatchIds } },
        { bookingId: { in: demoBookingIds } },
        { receiptNumber: { startsWith: 'FE-202603' } },
        { receiptNumber: { startsWith: 'FE-202604' } },
      ],
    },
    select: { id: true },
  });
  const demoSaleIds = demoSales.map((row) => row.id);

  const demoImports = await prisma.bankStatementImport.findMany({
    where: { originalFilename: { in: DEMO_IMPORT_FILENAMES } },
    select: { id: true },
  });
  const demoImportIds = demoImports.map((row) => row.id);

  const demoTransactions = await prisma.bankTransaction.findMany({
    where: {
      OR: [
        { customerId: { in: demoCustomerIds } },
        { saleId: { in: demoSaleIds } },
        { bookingId: { in: demoBookingIds } },
        { sourceFingerprint: { startsWith: 'demo:' } },
        { reference: { startsWith: 'DEMO-' } },
      ],
    },
    select: { id: true },
  });
  const demoTransactionIds = demoTransactions.map((row) => row.id);

  await prisma.bookingPaymentAllocation.deleteMany({
    where: {
      OR: [
        { bookingId: { in: demoBookingIds } },
        { bankTransactionId: { in: demoTransactionIds } },
      ],
    },
  });

  await prisma.bankReconciliation.deleteMany({
    where: {
      OR: [
        { statementImportId: { in: demoImportIds } },
        { notes: { contains: 'Demo reconciliation' } },
      ],
    },
  });

  await prisma.bankStatementLine.deleteMany({
    where: { importId: { in: demoImportIds } },
  });

  await prisma.portalOrderRequest.deleteMany({
    where: {
      OR: [
        { customerId: { in: demoCustomerIds } },
        { batchId: { in: demoBatchIds } },
      ],
    },
  });

  await prisma.inventoryCount.deleteMany({
    where: { batchId: { in: demoBatchIds } },
  });

  await prisma.bankTransaction.deleteMany({
    where: { id: { in: demoTransactionIds } },
  });

  await prisma.sale.deleteMany({
    where: { id: { in: demoSaleIds } },
  });

  await prisma.booking.deleteMany({
    where: { id: { in: demoBookingIds } },
  });

  await prisma.bankStatementImport.deleteMany({
    where: { id: { in: demoImportIds } },
  });

  await prisma.batch.deleteMany({
    where: { id: { in: demoBatchIds } },
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: { in: demoUserIds } },
  });

  await prisma.customer.deleteMany({
    where: { id: { in: demoCustomerIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: demoUserIds } },
  });
}

async function main() {
  ensureSafeDemoTarget();
  console.log('🥚 Seeding demo data...');

  await clearExistingDemoData();

  const adminPassword = await bcrypt.hash('admin12345', SALT_ROUNDS);
  const managerPassword = await bcrypt.hash(MANAGER_PASSWORD, SALT_ROUNDS);
  const staffPasswordHash = await bcrypt.hash(DEMO_STAFF_PASSWORD, SALT_ROUNDS);
  const portalPasswordHash = await bcrypt.hash(DEMO_PORTAL_PASSWORD, SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'chioma@fresheggs.com' },
    update: {
      firstName: 'Chioma',
      lastName: 'Ifeanyi-Eze',
      role: 'ADMIN',
      phone: '+234000000000',
      passwordHash: adminPassword,
      isActive: true,
    },
    create: {
      email: 'chioma@fresheggs.com',
      passwordHash: adminPassword,
      firstName: 'Chioma',
      lastName: 'Ifeanyi-Eze',
      role: 'ADMIN',
      phone: '+234000000000',
      isActive: true,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@fresheggs.com' },
    update: {
      firstName: 'Manager',
      lastName: 'Fresh Eggs',
      role: 'MANAGER',
      phone: '+2348010000001',
      passwordHash: managerPassword,
      isActive: true,
    },
    create: {
      email: 'manager@fresheggs.com',
      passwordHash: managerPassword,
      firstName: 'Manager',
      lastName: 'Fresh Eggs',
      role: 'MANAGER',
      phone: '+2348010000001',
      isActive: true,
    },
  });

  const recordKeeper = await prisma.user.create({
    data: {
      email: 'records@demo.fresheggs.local',
      passwordHash: staffPasswordHash,
      firstName: 'Adaeze',
      lastName: 'Records',
      phone: '+2348010000002',
      role: 'RECORD_KEEPER',
      isActive: true,
    },
  });

  const shopFloor = await prisma.user.create({
    data: {
      email: 'shopfloor@demo.fresheggs.local',
      passwordHash: staffPasswordHash,
      firstName: 'Tobi',
      lastName: 'Sales Floor',
      phone: '+2348010000003',
      role: 'SHOP_FLOOR',
      isActive: true,
    },
  });

  await ensureBaseSettings(admin.id);

  const accounts = {
    customerDeposit: await ensureBankAccount({
      name: 'Customer Deposit Account',
      accountType: 'CUSTOMER_DEPOSIT',
      lastFour: '0010',
      bankName: 'Providus Bank',
      isVirtual: false,
      supportsStatementImport: true,
      sortOrder: 10,
    }),
    sales: await ensureBankAccount({
      name: 'Sales Account',
      accountType: 'SALES',
      lastFour: '0020',
      bankName: 'Providus Bank',
      isVirtual: false,
      supportsStatementImport: true,
      sortOrder: 20,
    }),
    profit: await ensureBankAccount({
      name: 'Profit Account',
      accountType: 'PROFIT',
      lastFour: '0030',
      bankName: 'Providus Bank',
      isVirtual: false,
      supportsStatementImport: true,
      sortOrder: 30,
    }),
    cash: await ensureBankAccount({
      name: 'Cash Account',
      accountType: 'CASH_ON_HAND',
      lastFour: 'CASH',
      bankName: 'Internal Ledger',
      isVirtual: true,
      supportsStatementImport: false,
      sortOrder: 40,
    }),
  };

  const itemDefinitions = [
    { code: 'FE4300', name: 'FE4300', defaultWholesalePrice: 4800, defaultRetailPrice: 4900 },
    { code: 'FE4500', name: 'FE4500', defaultWholesalePrice: 4800, defaultRetailPrice: 4900 },
    { code: 'FE4600', name: 'FE4600', defaultWholesalePrice: 5400, defaultRetailPrice: 5500 },
    { code: 'FE4800', name: 'FE4800', defaultWholesalePrice: 5400, defaultRetailPrice: 5500 },
    { code: 'FE5200', name: 'FE5200', defaultWholesalePrice: 5400, defaultRetailPrice: 5500 },
  ];

  const items = {};
  for (const item of itemDefinitions) {
    items[item.code] = await prisma.item.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        category: 'FE_EGGS',
        unitLabel: 'crate',
        defaultWholesalePrice: item.defaultWholesalePrice,
        defaultRetailPrice: item.defaultRetailPrice,
        isActive: true,
      },
      create: {
        code: item.code,
        name: item.name,
        category: 'FE_EGGS',
        unitLabel: 'crate',
        defaultWholesalePrice: item.defaultWholesalePrice,
        defaultRetailPrice: item.defaultRetailPrice,
        isActive: true,
      },
    });
  }

  const customerDefinitions = [
    { name: 'Amina Stores', phone: '0809000001', email: 'amina@demo.fresheggs.local', portal: true, isFirstTime: false },
    { name: 'Kola Provision Mart', phone: '0809000002', email: 'kola@demo.fresheggs.local', portal: true, isFirstTime: false },
    { name: 'Ngozi Kitchen', phone: '0809000003', email: 'ngozi@demo.fresheggs.local', portal: true, isFirstTime: false },
    { name: 'Blessing Retail Hub', phone: '0809000004', email: 'blessing@demo.fresheggs.local', portal: true, isFirstTime: false },
    { name: 'Mama Tunde Foods', phone: '0809000005', email: 'mama.tunde@demo.fresheggs.local', portal: true, isFirstTime: false },
    { name: 'Emeka Wholesales', phone: '0809000006', email: null, portal: false, isFirstTime: false },
    { name: 'City Fresh Traders', phone: '0809000007', email: null, portal: false, isFirstTime: false },
    { name: 'Grace Supermarket', phone: '0809000008', email: null, portal: false, isFirstTime: false },
    { name: 'Chinedu Bakery', phone: '0809000009', email: null, portal: false, isFirstTime: false },
    { name: 'Halima Catering', phone: '0809000010', email: null, portal: false, isFirstTime: false },
  ];

  const customers = {};
  const portalUsers = {};
  for (const definition of customerDefinitions) {
    const customer = await prisma.customer.create({
      data: {
        name: definition.name,
        phone: definition.phone,
        email: definition.email,
        isFirstTime: definition.isFirstTime,
        notes: `Demo customer for ${definition.name}.`,
      },
    });
    customers[definition.name] = customer;

    if (definition.portal) {
      const { firstName, lastName } = splitName(definition.name);
      portalUsers[definition.name] = await prisma.user.create({
        data: {
          email: definition.email,
          passwordHash: portalPasswordHash,
          firstName,
          lastName,
          phone: definition.phone,
          role: 'CUSTOMER',
          isActive: true,
        },
      });
    }
  }

  const batchDefinitions = [
    {
      name: '18APR2026',
      status: 'OPEN',
      eggTypeKey: 'REGULAR',
      expectedDate: dateAt('2026-04-18'),
      expectedQuantity: 150,
      availableForBooking: 120,
      actualQuantity: null,
      freeCrates: 3,
      wholesalePrice: 5400,
      retailPrice: 5500,
      eggCodes: [
        { code: 'FE4600', quantity: 90, freeQty: 0, costPrice: 4600 },
        { code: 'FE4800', quantity: 60, freeQty: 0, costPrice: 4800 },
      ],
    },
    {
      name: '22APR2026',
      status: 'OPEN',
      eggTypeKey: 'SMALL',
      expectedDate: dateAt('2026-04-22'),
      expectedQuantity: 80,
      availableForBooking: 65,
      actualQuantity: null,
      freeCrates: 3,
      wholesalePrice: 4800,
      retailPrice: 4900,
      eggCodes: [
        { code: 'FE4300', quantity: 50, freeQty: 0, costPrice: 4300 },
        { code: 'FE4500', quantity: 30, freeQty: 0, costPrice: 4500 },
      ],
    },
    {
      name: '03APR2026',
      status: 'RECEIVED',
      eggTypeKey: 'REGULAR',
      expectedDate: dateAt('2026-04-03'),
      receivedDate: dateAt('2026-04-03', '11:00:00'),
      expectedQuantity: 130,
      availableForBooking: 90,
      actualQuantity: 133,
      freeCrates: 3,
      wholesalePrice: 5400,
      retailPrice: 5500,
      eggCodes: [
        { code: 'FE4600', quantity: 70, freeQty: 2, costPrice: 4600 },
        { code: 'FE4800', quantity: 60, freeQty: 1, costPrice: 4800 },
      ],
    },
    {
      name: '01APR2026',
      status: 'RECEIVED',
      eggTypeKey: 'SMALL',
      expectedDate: dateAt('2026-04-01'),
      receivedDate: dateAt('2026-04-01', '10:30:00'),
      expectedQuantity: 95,
      availableForBooking: 60,
      actualQuantity: 98,
      freeCrates: 3,
      wholesalePrice: 4800,
      retailPrice: 4900,
      eggCodes: [
        { code: 'FE4300', quantity: 55, freeQty: 2, costPrice: 4300 },
        { code: 'FE4500', quantity: 40, freeQty: 1, costPrice: 4500 },
      ],
    },
    {
      name: '20MAR2026',
      status: 'CLOSED',
      eggTypeKey: 'REGULAR',
      expectedDate: dateAt('2026-03-20'),
      receivedDate: dateAt('2026-03-20', '09:30:00'),
      closedDate: dateAt('2026-04-08', '08:00:00'),
      expectedQuantity: 110,
      availableForBooking: 90,
      actualQuantity: 113,
      freeCrates: 3,
      wholesalePrice: 5400,
      retailPrice: 5500,
      eggCodes: [
        { code: 'FE4600', quantity: 70, freeQty: 1, costPrice: 4600 },
        { code: 'FE5200', quantity: 40, freeQty: 2, costPrice: 5200 },
      ],
    },
  ];

  const batches = {};
  const batchEggCodes = {};
  for (const definition of batchDefinitions) {
    const batch = await prisma.batch.create({
      data: {
        name: definition.name,
        status: definition.status,
        eggTypeKey: definition.eggTypeKey,
        expectedDate: definition.expectedDate,
        receivedDate: definition.receivedDate,
        closedDate: definition.closedDate,
        expectedQuantity: definition.expectedQuantity,
        availableForBooking: definition.availableForBooking,
        actualQuantity: definition.actualQuantity,
        freeCrates: definition.freeCrates,
        wholesalePrice: definition.wholesalePrice,
        retailPrice: definition.retailPrice,
        costPrice: weightedAverageCost(definition.eggCodes),
        eggCodes: {
          create: definition.eggCodes.map((row) => ({
            code: row.code,
            itemId: items[row.code].id,
            costPrice: row.costPrice,
            wholesalePrice: definition.wholesalePrice,
            retailPrice: definition.retailPrice,
            quantity: row.quantity,
            freeQty: row.freeQty,
          })),
        },
      },
      include: { eggCodes: true },
    });

    batches[definition.name] = batch;
    batchEggCodes[definition.name] = Object.fromEntries(
      batch.eggCodes.map((row) => [row.code, row]),
    );
  }

  const bookingTransactions = {
    amina: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 86400,
        description: 'Booking payment from Amina Stores',
        reference: 'DEMO-BOOK-AMINA',
        transactionDate: dateAt('2026-04-06', '09:10:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:amina-booking',
        postedAt: dateAt('2026-04-06', '09:12:00'),
        customerId: customers['Amina Stores'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-06', '09:12:00'),
      },
    }),
    kola: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 216000,
        description: 'Booking payment from Kola Provision Mart',
        reference: 'DEMO-BOOK-KOLA',
        transactionDate: dateAt('2026-03-31', '10:05:00'),
        sourceType: 'STATEMENT_IMPORT',
        sourceFingerprint: 'demo:txn:kola-booking',
        postedAt: dateAt('2026-03-31', '10:06:00'),
        customerId: customers['Kola Provision Mart'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-03-31', '10:06:00'),
      },
    }),
    ngozi: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 162000,
        description: 'Booking payment from Ngozi Kitchen',
        reference: 'DEMO-BOOK-NGOZI',
        transactionDate: dateAt('2026-03-31', '11:20:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:ngozi-booking',
        postedAt: dateAt('2026-03-31', '11:21:00'),
        customerId: customers['Ngozi Kitchen'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-03-31', '11:21:00'),
      },
    }),
    emeka: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 320000,
        description: 'Bulk booking payment from Emeka Wholesales',
        reference: 'DEMO-BOOK-EMEKA',
        transactionDate: dateAt('2026-04-06', '12:00:00'),
        sourceType: 'STATEMENT_IMPORT',
        sourceFingerprint: 'demo:txn:emeka-booking',
        postedAt: dateAt('2026-04-06', '12:01:00'),
        customerId: customers['Emeka Wholesales'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-06', '12:01:00'),
      },
    }),
    grace: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 135000,
        description: 'Booking payment from Grace Supermarket',
        reference: 'DEMO-BOOK-GRACE',
        transactionDate: dateAt('2026-04-05', '14:30:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:grace-booking',
        postedAt: dateAt('2026-04-05', '14:31:00'),
        customerId: customers['Grace Supermarket'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-05', '14:31:00'),
      },
    }),
    chinedu: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 76800,
        description: 'Booking payment from Chinedu Bakery',
        reference: 'DEMO-BOOK-CHINEDU',
        transactionDate: dateAt('2026-04-07', '08:45:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:chinedu-booking',
        postedAt: dateAt('2026-04-07', '08:46:00'),
        customerId: customers['Chinedu Bakery'].id,
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-07', '08:46:00'),
      },
    }),
    unresolvedQueue: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'CUSTOMER_BOOKING',
        amount: 96000,
        description: 'Customer booking transfer awaiting customer link',
        reference: 'DEMO-QUEUE-BOOKING',
        transactionDate: dateAt('2026-04-08', '09:25:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:queue-booking',
        postedAt: dateAt('2026-04-08', '09:26:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-08', '09:26:00'),
      },
    }),
    unallocatedOne: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'UNALLOCATED_INCOME',
        amount: 50000,
        description: 'Transfer received, allocation still pending',
        reference: 'DEMO-UNALLOCATED-1',
        transactionDate: dateAt('2026-04-07', '12:15:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:unallocated-1',
        postedAt: dateAt('2026-04-07', '12:16:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-07', '12:16:00'),
      },
    }),
    unallocatedTwo: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'UNALLOCATED_INCOME',
        amount: 75000,
        description: 'Another income line waiting for review',
        reference: 'DEMO-UNALLOCATED-2',
        transactionDate: dateAt('2026-04-08', '10:05:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:unallocated-2',
        postedAt: dateAt('2026-04-08', '10:06:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-08', '10:06:00'),
      },
    }),
    bankCharge: await prisma.bankTransaction.create({
      data: {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'OUTFLOW',
        category: 'BANK_CHARGES',
        amount: 1250,
        description: 'Bank charge on customer deposit account',
        reference: 'DEMO-BANK-CHARGE',
        transactionDate: dateAt('2026-04-07', '17:30:00'),
        sourceType: 'MANUAL',
        sourceFingerprint: 'demo:txn:bank-charge',
        postedAt: dateAt('2026-04-07', '17:31:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-07', '17:31:00'),
      },
    }),
  };

  const bookings = {};
  const bookingDefinitions = [
    {
      key: 'amina',
      customer: 'Amina Stores',
      batch: '18APR2026',
      quantity: 20,
      amountPaid: 86400,
      status: 'CONFIRMED',
      channel: 'website',
      createdAt: dateAt('2026-04-06', '09:20:00'),
      notes: 'Portal booking for upcoming regular batch.',
    },
    {
      key: 'emekaRegular',
      customer: 'Emeka Wholesales',
      batch: '18APR2026',
      quantity: 40,
      amountPaid: 180000,
      status: 'CONFIRMED',
      channel: 'backend',
      createdAt: dateAt('2026-04-06', '12:15:00'),
      notes: 'Bulk deposit allocation story — regular batch portion.',
    },
    {
      key: 'grace',
      customer: 'Grace Supermarket',
      batch: '18APR2026',
      quantity: 25,
      amountPaid: 135000,
      status: 'CONFIRMED',
      channel: 'backend',
      createdAt: dateAt('2026-04-05', '14:40:00'),
      notes: 'Fully paid open-batch booking.',
    },
    {
      key: 'emekaSmall',
      customer: 'Emeka Wholesales',
      batch: '22APR2026',
      quantity: 30,
      amountPaid: 140000,
      status: 'CONFIRMED',
      channel: 'backend',
      createdAt: dateAt('2026-04-06', '12:16:00'),
      notes: 'Bulk deposit allocation story — small batch portion.',
    },
    {
      key: 'chinedu',
      customer: 'Chinedu Bakery',
      batch: '22APR2026',
      quantity: 20,
      amountPaid: 76800,
      status: 'CONFIRMED',
      channel: 'website',
      createdAt: dateAt('2026-04-07', '08:55:00'),
      notes: 'Portal booking with minimum payment story.',
    },
    {
      key: 'kola',
      customer: 'Kola Provision Mart',
      batch: '03APR2026',
      quantity: 40,
      amountPaid: 216000,
      status: 'CONFIRMED',
      channel: 'website',
      createdAt: dateAt('2026-03-31', '10:20:00'),
      notes: 'Fully paid booking whose batch has now arrived.',
    },
    {
      key: 'ngozi',
      customer: 'Ngozi Kitchen',
      batch: '03APR2026',
      quantity: 30,
      amountPaid: 162000,
      status: 'PICKED_UP',
      channel: 'website',
      createdAt: dateAt('2026-03-31', '11:30:00'),
      notes: 'Portal booking already converted to pickup sale.',
    },
  ];

  for (const definition of bookingDefinitions) {
    const batch = batches[definition.batch];
    const booking = await prisma.booking.create({
      data: {
        customerId: customers[definition.customer].id,
        batchId: batch.id,
        quantity: definition.quantity,
        amountPaid: definition.amountPaid,
        orderValue: definition.quantity * Number(batch.wholesalePrice),
        status: definition.status,
        channel: definition.channel,
        notes: definition.notes,
        createdAt: definition.createdAt,
      },
    });
    bookings[definition.key] = booking;
  }

  await prisma.bookingPaymentAllocation.createMany({
    data: [
      { bookingId: bookings.amina.id, bankTransactionId: bookingTransactions.amina.id, amount: 86400, allocatedById: recordKeeper.id, createdAt: dateAt('2026-04-06', '09:25:00') },
      { bookingId: bookings.kola.id, bankTransactionId: bookingTransactions.kola.id, amount: 216000, allocatedById: recordKeeper.id, createdAt: dateAt('2026-03-31', '10:25:00') },
      { bookingId: bookings.ngozi.id, bankTransactionId: bookingTransactions.ngozi.id, amount: 162000, allocatedById: recordKeeper.id, createdAt: dateAt('2026-03-31', '11:35:00') },
      { bookingId: bookings.grace.id, bankTransactionId: bookingTransactions.grace.id, amount: 135000, allocatedById: recordKeeper.id, createdAt: dateAt('2026-04-05', '14:45:00') },
      { bookingId: bookings.chinedu.id, bankTransactionId: bookingTransactions.chinedu.id, amount: 76800, allocatedById: recordKeeper.id, createdAt: dateAt('2026-04-07', '09:00:00') },
      { bookingId: bookings.emekaRegular.id, bankTransactionId: bookingTransactions.emeka.id, amount: 180000, allocatedById: recordKeeper.id, createdAt: dateAt('2026-04-06', '12:20:00') },
      { bookingId: bookings.emekaSmall.id, bankTransactionId: bookingTransactions.emeka.id, amount: 140000, allocatedById: recordKeeper.id, createdAt: dateAt('2026-04-06', '12:21:00') },
    ],
  });

  await prisma.bankTransaction.update({ where: { id: bookingTransactions.amina.id }, data: { bookingId: bookings.amina.id } });
  await prisma.bankTransaction.update({ where: { id: bookingTransactions.kola.id }, data: { bookingId: bookings.kola.id } });
  await prisma.bankTransaction.update({ where: { id: bookingTransactions.ngozi.id }, data: { bookingId: bookings.ngozi.id } });
  await prisma.bankTransaction.update({ where: { id: bookingTransactions.grace.id }, data: { bookingId: bookings.grace.id } });
  await prisma.bankTransaction.update({ where: { id: bookingTransactions.chinedu.id }, data: { bookingId: bookings.chinedu.id } });

  const portalRequests = {
    blessing: await prisma.portalOrderRequest.create({
      data: {
        customerId: customers['Blessing Retail Hub'].id,
        batchId: batches['03APR2026'].id,
        quantity: 15,
        priceType: 'RETAIL',
        unitPrice: 5500,
        estimatedTotal: 82500,
        status: 'OPEN',
        notes: 'Please confirm afternoon pickup time.',
        createdAt: dateAt('2026-04-08', '08:30:00'),
      },
    }),
    mamaTunde: await prisma.portalOrderRequest.create({
      data: {
        customerId: customers['Mama Tunde Foods'].id,
        batchId: batches['01APR2026'].id,
        quantity: 18,
        priceType: 'RETAIL',
        unitPrice: 4900,
        estimatedTotal: 88200,
        status: 'FULFILLED',
        notes: 'Completed by POS after team confirmation.',
        createdAt: dateAt('2026-04-06', '09:10:00'),
      },
    }),
  };

  const sales = {};

  async function createSale({ key, receiptNumber, customerName, batchName = null, bookingKey = null, recordedById, paymentMethod, saleDate, lines }) {
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalAmount = money(lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0));
    const totalCost = money(lines.reduce((sum, line) => sum + (line.quantity * line.costPrice), 0));

    const sale = await prisma.sale.create({
      data: {
        receiptNumber,
        customerId: customers[customerName].id,
        batchId: batchName ? batches[batchName].id : null,
        bookingId: bookingKey ? bookings[bookingKey].id : null,
        recordedById,
        totalQuantity,
        totalAmount,
        totalCost,
        paymentMethod,
        saleDate,
        createdAt: saleDate,
        lineItems: {
          create: lines.map((line) => ({
            batchEggCodeId: batchEggCodes[line.batchName][line.code].id,
            saleType: line.saleType,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            costPrice: line.costPrice,
            lineTotal: money(line.quantity * line.unitPrice),
          })),
        },
      },
      include: { lineItems: true },
    });

    sales[key] = sale;
    return sale;
  }

  await createSale({
    key: 'graceOldTransfer',
    receiptNumber: 'FE-20260323-1001',
    customerName: 'Grace Supermarket',
    batchName: '20MAR2026',
    recordedById: manager.id,
    paymentMethod: 'TRANSFER',
    saleDate: dateAt('2026-03-23', '11:00:00'),
    lines: [
      { batchName: '20MAR2026', code: 'FE4600', saleType: 'WHOLESALE', quantity: 20, unitPrice: 5400, costPrice: 4600 },
      { batchName: '20MAR2026', code: 'FE5200', saleType: 'WHOLESALE', quantity: 15, unitPrice: 5400, costPrice: 5200 },
    ],
  });

  await createSale({
    key: 'cityOldCash',
    receiptNumber: 'FE-20260325-1002',
    customerName: 'City Fresh Traders',
    batchName: '20MAR2026',
    recordedById: shopFloor.id,
    paymentMethod: 'CASH',
    saleDate: dateAt('2026-03-25', '15:10:00'),
    lines: [
      { batchName: '20MAR2026', code: 'FE4600', saleType: 'RETAIL', quantity: 25, unitPrice: 5500, costPrice: 4600 },
      { batchName: '20MAR2026', code: 'FE5200', saleType: 'RETAIL', quantity: 3, unitPrice: 5500, costPrice: 5200 },
    ],
  });

  await createSale({
    key: 'halimaTransfer',
    receiptNumber: 'FE-20260327-1003',
    customerName: 'Halima Catering',
    batchName: '20MAR2026',
    recordedById: manager.id,
    paymentMethod: 'TRANSFER',
    saleDate: dateAt('2026-03-27', '13:20:00'),
    lines: [
      { batchName: '20MAR2026', code: 'FE4600', saleType: 'WHOLESALE', quantity: 15, unitPrice: 5400, costPrice: 4600 },
      { batchName: '20MAR2026', code: 'FE5200', saleType: 'WHOLESALE', quantity: 25, unitPrice: 5400, costPrice: 5200 },
    ],
  });

  await createSale({
    key: 'ngoziPickup',
    receiptNumber: 'FE-20260405-1004',
    customerName: 'Ngozi Kitchen',
    batchName: '03APR2026',
    bookingKey: 'ngozi',
    recordedById: shopFloor.id,
    paymentMethod: 'PRE_ORDER',
    saleDate: dateAt('2026-04-05', '10:45:00'),
    lines: [
      { batchName: '03APR2026', code: 'FE4600', saleType: 'WHOLESALE', quantity: 15, unitPrice: 5400, costPrice: 4600 },
      { batchName: '03APR2026', code: 'FE4800', saleType: 'WHOLESALE', quantity: 15, unitPrice: 5400, costPrice: 4800 },
    ],
  });

  await createSale({
    key: 'mamaPos',
    receiptNumber: 'FE-20260406-1005',
    customerName: 'Mama Tunde Foods',
    batchName: '01APR2026',
    recordedById: shopFloor.id,
    paymentMethod: 'POS_CARD',
    saleDate: dateAt('2026-04-06', '12:10:00'),
    lines: [
      { batchName: '01APR2026', code: 'FE4300', saleType: 'RETAIL', quantity: 10, unitPrice: 4900, costPrice: 4300 },
      { batchName: '01APR2026', code: 'FE4500', saleType: 'RETAIL', quantity: 8, unitPrice: 4900, costPrice: 4500 },
    ],
  });

  await createSale({
    key: 'chineduCash',
    receiptNumber: 'FE-20260406-1006',
    customerName: 'Chinedu Bakery',
    batchName: '03APR2026',
    recordedById: shopFloor.id,
    paymentMethod: 'CASH',
    saleDate: dateAt('2026-04-06', '16:05:00'),
    lines: [
      { batchName: '03APR2026', code: 'FE4600', saleType: 'RETAIL', quantity: 8, unitPrice: 5500, costPrice: 4600 },
    ],
  });

  await createSale({
    key: 'cityMultiBatch',
    receiptNumber: 'FE-20260407-1007',
    customerName: 'City Fresh Traders',
    batchName: '03APR2026',
    recordedById: manager.id,
    paymentMethod: 'TRANSFER',
    saleDate: dateAt('2026-04-07', '11:35:00'),
    lines: [
      { batchName: '03APR2026', code: 'FE4800', saleType: 'WHOLESALE', quantity: 20, unitPrice: 5400, costPrice: 4800 },
      { batchName: '20MAR2026', code: 'FE4600', saleType: 'WHOLESALE', quantity: 10, unitPrice: 5400, costPrice: 4600 },
    ],
  });

  await createSale({
    key: 'blessingCracked',
    receiptNumber: 'FE-20260407-1008',
    customerName: 'Blessing Retail Hub',
    batchName: '01APR2026',
    recordedById: shopFloor.id,
    paymentMethod: 'CASH',
    saleDate: dateAt('2026-04-07', '15:00:00'),
    lines: [
      { batchName: '01APR2026', code: 'FE4300', saleType: 'CRACKED', quantity: 12, unitPrice: 4200, costPrice: 4300 },
    ],
  });

  const paymentTransactions = [
    {
      saleKey: 'graceOldTransfer',
      bankAccountId: accounts.customerDeposit.id,
      direction: 'INFLOW',
      category: 'DIRECT_SALE_TRANSFER',
      amount: 189000,
      description: 'Direct sale transfer from Grace Supermarket',
      reference: 'DEMO-SALE-GRACE-1001',
      transactionDate: dateAt('2026-03-23', '11:05:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-grace-1001',
      customerId: customers['Grace Supermarket'].id,
      enteredById: manager.id,
    },
    {
      saleKey: 'cityOldCash',
      bankAccountId: accounts.cash.id,
      direction: 'INFLOW',
      category: 'CASH_SALE',
      amount: 154000,
      description: 'Cash sale from City Fresh Traders',
      reference: 'DEMO-SALE-CITY-1002',
      transactionDate: dateAt('2026-03-25', '15:11:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-city-1002',
      customerId: customers['City Fresh Traders'].id,
      enteredById: shopFloor.id,
    },
    {
      saleKey: 'halimaTransfer',
      bankAccountId: accounts.customerDeposit.id,
      direction: 'INFLOW',
      category: 'DIRECT_SALE_TRANSFER',
      amount: 216000,
      description: 'Direct sale transfer from Halima Catering',
      reference: 'DEMO-SALE-HALIMA-1003',
      transactionDate: dateAt('2026-03-27', '13:21:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-halima-1003',
      customerId: customers['Halima Catering'].id,
      enteredById: manager.id,
    },
    {
      saleKey: 'mamaPos',
      bankAccountId: accounts.customerDeposit.id,
      direction: 'INFLOW',
      category: 'POS_SETTLEMENT',
      amount: 88200,
      description: 'POS settlement for Mama Tunde Foods',
      reference: 'DEMO-SALE-MAMA-1005',
      transactionDate: dateAt('2026-04-06', '12:11:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-mama-1005',
      customerId: customers['Mama Tunde Foods'].id,
      enteredById: shopFloor.id,
    },
    {
      saleKey: 'chineduCash',
      bankAccountId: accounts.cash.id,
      direction: 'INFLOW',
      category: 'CASH_SALE',
      amount: 44000,
      description: 'Cash sale from Chinedu Bakery',
      reference: 'DEMO-SALE-CHINEDU-1006',
      transactionDate: dateAt('2026-04-06', '16:06:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-chinedu-1006',
      customerId: customers['Chinedu Bakery'].id,
      enteredById: shopFloor.id,
    },
    {
      saleKey: 'cityMultiBatch',
      bankAccountId: accounts.customerDeposit.id,
      direction: 'INFLOW',
      category: 'DIRECT_SALE_TRANSFER',
      amount: 162000,
      description: 'Direct sale transfer from City Fresh Traders',
      reference: 'DEMO-SALE-CITY-1007',
      transactionDate: dateAt('2026-04-07', '11:36:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-city-1007',
      customerId: customers['City Fresh Traders'].id,
      enteredById: manager.id,
    },
    {
      saleKey: 'blessingCracked',
      bankAccountId: accounts.cash.id,
      direction: 'INFLOW',
      category: 'CASH_SALE',
      amount: 50400,
      description: 'Cash sale from Blessing Retail Hub',
      reference: 'DEMO-SALE-BLESSING-1008',
      transactionDate: dateAt('2026-04-07', '15:01:00'),
      sourceType: 'SYSTEM',
      sourceFingerprint: 'demo:txn:sale-blessing-1008',
      customerId: customers['Blessing Retail Hub'].id,
      enteredById: shopFloor.id,
    },
  ];

  for (const tx of paymentTransactions) {
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: tx.bankAccountId,
        direction: tx.direction,
        category: tx.category,
        amount: tx.amount,
        description: tx.description,
        reference: tx.reference,
        transactionDate: tx.transactionDate,
        sourceType: tx.sourceType,
        sourceFingerprint: tx.sourceFingerprint,
        postedAt: tx.transactionDate,
        saleId: sales[tx.saleKey].id,
        customerId: tx.customerId,
        enteredById: tx.enteredById,
        createdAt: tx.transactionDate,
      },
    });
  }

  const transferGroupCashToDeposit = 'demo:transfer:cash-to-deposit';
  const transferGroupDepositToSales = 'demo:transfer:deposit-to-sales';
  const transferGroupSalesToProfit = 'demo:transfer:sales-to-profit';

  await prisma.bankTransaction.createMany({
    data: [
      {
        bankAccountId: accounts.cash.id,
        direction: 'OUTFLOW',
        category: 'INTERNAL_TRANSFER_OUT',
        amount: 200000,
        description: 'Cash moved into Customer Deposit Account',
        reference: 'DEMO-TRANSFER-CASH-OUT',
        transactionDate: dateAt('2026-04-08', '11:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:cash-to-deposit-out',
        internalTransferGroupId: transferGroupCashToDeposit,
        postedAt: dateAt('2026-04-08', '11:00:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-08', '11:00:00'),
      },
      {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'INFLOW',
        category: 'INTERNAL_TRANSFER_IN',
        amount: 200000,
        description: 'Cash moved in from Cash Account',
        reference: 'DEMO-TRANSFER-CASH-IN',
        transactionDate: dateAt('2026-04-08', '11:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:cash-to-deposit-in',
        internalTransferGroupId: transferGroupCashToDeposit,
        postedAt: dateAt('2026-04-08', '11:00:00'),
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-08', '11:00:00'),
      },
      {
        bankAccountId: accounts.customerDeposit.id,
        direction: 'OUTFLOW',
        category: 'SALES_TRANSFER_OUT',
        amount: 250000,
        description: 'Money moved from Customer Deposit Account to Sales Account',
        reference: 'DEMO-TRANSFER-SALES-OUT',
        transactionDate: dateAt('2026-04-08', '13:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:deposit-to-sales-out',
        internalTransferGroupId: transferGroupDepositToSales,
        postedAt: dateAt('2026-04-08', '13:00:00'),
        enteredById: admin.id,
        createdAt: dateAt('2026-04-08', '13:00:00'),
      },
      {
        bankAccountId: accounts.sales.id,
        direction: 'INFLOW',
        category: 'SALES_TRANSFER_IN',
        amount: 250000,
        description: 'Money received into Sales Account',
        reference: 'DEMO-TRANSFER-SALES-IN',
        transactionDate: dateAt('2026-04-08', '13:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:deposit-to-sales-in',
        internalTransferGroupId: transferGroupDepositToSales,
        postedAt: dateAt('2026-04-08', '13:00:00'),
        enteredById: admin.id,
        createdAt: dateAt('2026-04-08', '13:00:00'),
      },
      {
        bankAccountId: accounts.sales.id,
        direction: 'OUTFLOW',
        category: 'PROFIT_TRANSFER_OUT',
        amount: 150000,
        description: 'Money moved from Sales Account to Profit Account',
        reference: 'DEMO-TRANSFER-PROFIT-OUT',
        transactionDate: dateAt('2026-04-08', '16:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:sales-to-profit-out',
        internalTransferGroupId: transferGroupSalesToProfit,
        postedAt: dateAt('2026-04-08', '16:00:00'),
        enteredById: admin.id,
        createdAt: dateAt('2026-04-08', '16:00:00'),
      },
      {
        bankAccountId: accounts.profit.id,
        direction: 'INFLOW',
        category: 'PROFIT_TRANSFER_IN',
        amount: 150000,
        description: 'Money received into Profit Account',
        reference: 'DEMO-TRANSFER-PROFIT-IN',
        transactionDate: dateAt('2026-04-08', '16:00:00'),
        sourceType: 'INTERNAL_TRANSFER',
        sourceFingerprint: 'demo:txn:sales-to-profit-in',
        internalTransferGroupId: transferGroupSalesToProfit,
        postedAt: dateAt('2026-04-08', '16:00:00'),
        enteredById: admin.id,
        createdAt: dateAt('2026-04-08', '16:00:00'),
      },
    ],
  });

  await prisma.inventoryCount.createMany({
    data: [
      {
        batchId: batches['03APR2026'].id,
        countDate: dateAt('2026-04-07', '18:00:00'),
        physicalCount: 70,
        systemCount: 71,
        discrepancy: -1,
        crackedWriteOff: 4,
        notes: 'End-of-day stock count with minor shortage.',
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-07', '18:05:00'),
      },
      {
        batchId: batches['01APR2026'].id,
        countDate: dateAt('2026-04-07', '18:10:00'),
        physicalCount: 30,
        systemCount: 40,
        discrepancy: -10,
        crackedWriteOff: 28,
        notes: 'Crack pressure batch with significant write-off.',
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-04-07', '18:12:00'),
      },
      {
        batchId: batches['20MAR2026'].id,
        countDate: dateAt('2026-03-29', '17:00:00'),
        physicalCount: 12,
        systemCount: 12,
        discrepancy: 0,
        crackedWriteOff: 2,
        notes: 'Late-stage count before batch close.',
        enteredById: recordKeeper.id,
        createdAt: dateAt('2026-03-29', '17:05:00'),
      },
    ],
  });

  const statementImport = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: accounts.customerDeposit.id,
      provider: 'PROVIDUS',
      originalFilename: 'providus-demo-week1.csv',
      statementDateFrom: dateAt('2026-04-06', '00:00:00'),
      statementDateTo: dateAt('2026-04-07', '23:59:00'),
      openingBalance: 24500000,
      closingBalance: 24850000,
      status: 'PARTIALLY_POSTED',
      rawRowCount: 8,
      parsedRowCount: 8,
      postedRowCount: 2,
      importedById: recordKeeper.id,
      createdAt: dateAt('2026-04-08', '07:45:00'),
    },
  });

  await prisma.bankStatementLine.createMany({
    data: [
      {
        importId: statementImport.id,
        lineNumber: 1,
        transactionDate: dateAt('2026-04-06', '09:00:00'),
        actualTransactionDate: dateAt('2026-04-06', '09:00:00'),
        valueDate: dateAt('2026-04-06', '09:00:00'),
        description: 'INWARD TRANSFER FROM OPAY / AMINA',
        creditAmount: 16200,
        runningBalance: 24516200,
        direction: 'INFLOW',
        reviewStatus: 'PENDING_REVIEW',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'UNALLOCATED_INCOME',
        fingerprint: 'demo:stmt:1',
        rawPayload: { demo: true, line: 1 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 2,
        transactionDate: dateAt('2026-04-06', '10:00:00'),
        actualTransactionDate: dateAt('2026-04-06', '10:00:00'),
        valueDate: dateAt('2026-04-06', '10:00:00'),
        description: 'INWARD TRANSFER / BOOKING HOLD',
        creditAmount: 30000,
        runningBalance: 24546200,
        direction: 'INFLOW',
        reviewStatus: 'READY_TO_POST',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'CUSTOMER_BOOKING',
        selectedCustomerId: customers['Blessing Retail Hub'].id,
        fingerprint: 'demo:stmt:2',
        rawPayload: { demo: true, line: 2 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 3,
        transactionDate: dateAt('2026-04-06', '11:00:00'),
        actualTransactionDate: dateAt('2026-04-06', '11:00:00'),
        valueDate: dateAt('2026-04-06', '11:00:00'),
        description: 'INWARD TRANSFER DUPLICATE TEST',
        creditAmount: 44000,
        runningBalance: 24590200,
        direction: 'INFLOW',
        reviewStatus: 'DUPLICATE',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'UNALLOCATED_INCOME',
        fingerprint: 'demo:stmt:3',
        rawPayload: { demo: true, line: 3 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 4,
        transactionDate: dateAt('2026-04-06', '12:00:00'),
        actualTransactionDate: dateAt('2026-04-06', '12:00:00'),
        valueDate: dateAt('2026-04-06', '12:00:00'),
        description: 'BANK CHARGE REVERSAL TEST',
        debitAmount: 2500,
        runningBalance: 24587700,
        direction: 'OUTFLOW',
        reviewStatus: 'SKIPPED',
        suggestedCategory: 'UNALLOCATED_EXPENSE',
        selectedCategory: 'BANK_CHARGES',
        fingerprint: 'demo:stmt:4',
        rawPayload: { demo: true, line: 4 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 5,
        transactionDate: dateAt('2026-03-31', '10:05:00'),
        actualTransactionDate: dateAt('2026-03-31', '10:05:00'),
        valueDate: dateAt('2026-03-31', '10:05:00'),
        description: 'INWARD TRANSFER / KOLA PROVISION MART',
        creditAmount: 216000,
        runningBalance: 24803700,
        direction: 'INFLOW',
        reviewStatus: 'POSTED',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'CUSTOMER_BOOKING',
        selectedCustomerId: customers['Kola Provision Mart'].id,
        postedTransactionId: bookingTransactions.kola.id,
        fingerprint: 'demo:stmt:5',
        rawPayload: { demo: true, line: 5 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 6,
        transactionDate: dateAt('2026-04-06', '12:00:00'),
        actualTransactionDate: dateAt('2026-04-06', '12:00:00'),
        valueDate: dateAt('2026-04-06', '12:00:00'),
        description: 'INWARD TRANSFER / EMEKA WHOLESALES',
        creditAmount: 320000,
        runningBalance: 25123700,
        direction: 'INFLOW',
        reviewStatus: 'POSTED',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'CUSTOMER_BOOKING',
        selectedCustomerId: customers['Emeka Wholesales'].id,
        postedTransactionId: bookingTransactions.emeka.id,
        fingerprint: 'demo:stmt:6',
        rawPayload: { demo: true, line: 6 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 7,
        transactionDate: dateAt('2026-04-07', '13:00:00'),
        actualTransactionDate: dateAt('2026-04-07', '13:00:00'),
        valueDate: dateAt('2026-04-07', '13:00:00'),
        description: 'BANK CHARGE SMALL FEE',
        debitAmount: 1000,
        runningBalance: 25122700,
        direction: 'OUTFLOW',
        reviewStatus: 'READY_TO_POST',
        suggestedCategory: 'UNALLOCATED_EXPENSE',
        selectedCategory: 'BANK_CHARGES',
        fingerprint: 'demo:stmt:7',
        rawPayload: { demo: true, line: 7 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
      {
        importId: statementImport.id,
        lineNumber: 8,
        transactionDate: dateAt('2026-04-07', '16:00:00'),
        actualTransactionDate: dateAt('2026-04-07', '16:00:00'),
        valueDate: dateAt('2026-04-07', '16:00:00'),
        description: 'INWARD TRANSFER UNALLOCATED TEST',
        creditAmount: 5000,
        runningBalance: 25127700,
        direction: 'INFLOW',
        reviewStatus: 'PENDING_REVIEW',
        suggestedCategory: 'UNALLOCATED_INCOME',
        selectedCategory: 'UNALLOCATED_INCOME',
        fingerprint: 'demo:stmt:8',
        rawPayload: { demo: true, line: 8 },
        createdAt: dateAt('2026-04-08', '07:46:00'),
      },
    ],
  });

  await prisma.bankReconciliation.create({
    data: {
      bankAccountId: accounts.customerDeposit.id,
      statementImportId: statementImport.id,
      statementDate: dateAt('2026-04-07', '23:59:00'),
      openingBalance: 24500000,
      closingBalance: 24850000,
      systemBalance: 24850000,
      variance: 0,
      status: 'BALANCED',
      notes: 'Demo reconciliation for statement review screen.',
      reconciledById: recordKeeper.id,
      createdAt: dateAt('2026-04-08', '08:30:00'),
    },
  });

  console.log('✅ Demo data seed complete');
  console.log('Portal demo customers use password:', DEMO_PORTAL_PASSWORD);
  console.log('Staff demo users use password:', DEMO_STAFF_PASSWORD);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
