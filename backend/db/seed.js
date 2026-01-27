const { PrismaClient, GroupLevel } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // ================================
  // Create Event Categories
  // ================================
  const categories = [
    { code: 'TRY_DIVE', label: 'Lezione Prova' },
    { code: 'COURSE_OPEN', label: 'Corso Open' },
    { code: 'COURSE_ADVANCED', label: 'Corso Advanced' },
    { code: 'COURSE_DEEP', label: 'Corso Deep' },
    { code: 'TRAINING_ALL', label: 'Allenamento aperto a tutti' },
    { code: 'TRAINING_OPEN', label: 'Allenamento Open' },
    { code: 'TRAINING_ADVANCED', label: 'Allenamento Advanced' },
    { code: 'TRAINING_DEEP', label: 'Allenamento Deep' },
    { code: 'OPEN_WATER_ALL', label: 'Acque Libere aperto a tutti' },
    { code: 'OPEN_WATER_OPEN', label: 'Acque Libere Open' },
    { code: 'OPEN_WATER_ADVANCE', label: 'Acque Libere Advance' },
    { code: 'OPEN_WATER_DEEP', label: 'Acque Libere Deep' },
    { code: 'Y40_ALL', label: 'Uscita Y-40 aperto a tutti' },
    { code: 'Y40_OPEN', label: 'Uscita Y-40 Open' },
    { code: 'Y40_ADVANCED', label: 'Uscita Y-40 Advanced' },
    { code: 'Y40_DEEP', label: 'Uscita Y-40 Deep' },
    { code: 'EVENT_SPECIAL_FREE', label: 'Evento Speciale Gratuito' },
    { code: 'EVENT_SPECIAL', label: 'Evento Speciale' },
    { code: 'EVENT_SPECIAL_OPEN', label: 'Evento Speciale Open' },
    { code: 'EVENT_SPECIAL_ADVANCED', label: 'Evento Speciale Advanced' },
    { code: 'EVENT_SPECIAL_DEEP', label: 'Evento Speciale Deep' },
  ];

  await prisma.eventCategory.createMany({
    data: categories,
    skipDuplicates: true
  });

  console.log('Event categories created');


  // ================================
  // Create Groups
  // ================================
  const groups = [
    { name: 'Open', description: 'Gruppo Open', level: GroupLevel.OPEN },
    { name: 'Advanced', description: 'Gruppo Advanced', level: GroupLevel.ADVANCED },
    { name: 'Deep', description: 'Gruppo Deep', level: GroupLevel.DEEP },
    { name: 'Allenamento', description: 'Gruppo Allenamento', level: GroupLevel.ALL },
    { name: 'Gruppo Agonistico', description: 'Gruppo Agonistico', level: GroupLevel.DEEP },
  ];

  for (const group of groups) {
    await prisma.group.upsert({
      where: { name: group.name },
      update: {},
      create: group
    });
  }
  console.log('Groups created');

  // ================================
  // Create default superadmin user
  // ================================
  const hashedSuperAdminPassword = await bcrypt.hash('SuperAdmin123!PasswordSuperStrong@!', 10);

  const superAdminUser = await prisma.user.upsert({
    where: { email: 'superadmin@fakemail.it' },
    update: {},
    create: {
      email: 'superadmin@fakemail.it',
      password: hashedSuperAdminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPERADMIN',
      status: 'SUBSCRIBED',
      refreshToken: null
    }
  });
  console.log('Super Admin user created:', superAdminUser.email);

  // ================================
  // Create default admin user
  // ================================
  const hashedAdminPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'info@freedivingbluedream.it' },
    update: {},
    create: {
      email: 'info@freedivingbluedream.it',
      password: hashedAdminPassword,
      firstName: 'Admin',
      lastName: 'BlueDream',
      role: 'ADMIN',
      status: 'SUBSCRIBED',
      refreshToken: null
    }
  });
  console.log('Admin user created:', adminUser.email);

  // ================================
  // Create a test regular user
  // ================================
  const hashedTestUserPassword = await bcrypt.hash('test123', 10);

  const testUser = await prisma.user.upsert({
    where: { email: 'user@test.com' },
    update: {},
    create: {
      email: 'user@test.com',
      password: hashedTestUserPassword,
      firstName: 'Test',
      lastName: 'User',
      role: 'USER',
      status: 'SUBSCRIBED',
      refreshToken: null
    }
  });
  console.log('Test user created:', testUser.email);

  // ================================
  // OPTIONAL: Assign subscription to test user
  // ================================
  // Create a subscription for the test user (1 month validity)
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setMonth(now.getMonth() + 1);

  const existing = await prisma.subscription.findFirst({
    where: {
      userId: testUser.id,
      status: 'ACTIVE',
    },
  });

if (!existing) {
  const subscription = await prisma.subscription.create({
    data: {
      userId: testUser.id,
      startDate: now,
      endDate: nextMonth,
      amount: 50,
      currency: 'EUR',
      ingressi: 2,
      status: 'ACTIVE',
    },
  });

  // Assign all groups to the subscription
  const group = await prisma.group.findFirst({
    where: { level: 'ADVANCED' }
  });
  
  if (group) {
    await prisma.userGroup.create({
      data: {
        userId: testUser.id,
        groupId: group.id,
        subscriptionId: subscription.id,
        validFrom: now,
        validTo: nextMonth,
        isActive: true
      }
    });
    console.log('Subscription and user groups assigned to test user');
  }else{
    console.log('Gruppo non trovato');
  }
}

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
