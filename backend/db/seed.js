const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // ================================
  // Create Event Categories
  // ================================
  const categories = [
    { name: 'Corso Open' },
    { name: 'Corso Advanced' },
    { name: 'Allenamento' }
  ];

  for (const category of categories) {
    await prisma.eventCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category
    });
  }
  console.log('Event categories created');

  // ================================
  // Create Groups
  // ================================
  const groups = [
    { name: 'Open', description: 'Gruppo Open' },
    { name: 'Advanced', description: 'Gruppo Advanced' },
    { name: 'Allenamento', description: 'Gruppo Allenamento' },
    { name: 'Gruppo Agonistico', description: 'Gruppo Agonistico' }
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

  const subscription = await prisma.subscription.create({
    data: {
      userId: testUser.id,
      startDate: now,
      endDate: nextMonth,
      amount: 50,
      currency: 'EUR',
      status: 'ACTIVE'
    }
  });

  // Assign all groups to the subscription
  const allGroups = await prisma.group.findMany();
  for (const group of allGroups) {
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
  }
  console.log('Subscription and user groups assigned to test user');

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
