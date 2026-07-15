import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org' },
    update: {},
    create: { id: 'seed-org', name: 'QUASTECH', receiptPrefix: 'QST' },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'seed-branch' },
    update: {},
    create: {
      id: 'seed-branch',
      organizationId: org.id,
      name: 'Head Office',
      city: 'Thane',
      state: 'Maharashtra',
    },
  });

  const email = 'superadmin@quastech.local';
  const password = 'ChangeMe@123';
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email } },
    update: {},
    create: {
      organizationId: org.id,
      branchId: branch.id,
      role: 'SUPER_ADMIN',
      name: 'Super Admin',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
    },
  });

  console.log('Seeded.');
  console.log(`  Login:    ${email}`);
  console.log(`  Password: ${password}  (must change on first login)`);
}

main().finally(() => prisma.$disconnect());
