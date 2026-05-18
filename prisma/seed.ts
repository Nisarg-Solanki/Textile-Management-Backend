import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getSuperAdminEmails } from '../src/lib/superAdmin';
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  const emails = getSuperAdminEmails();

  for (const email of emails) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name: 'Super Admin',
        email,
        passwordHash: await bcrypt.hash('Admin@1234', 12),
        role: 'super_admin',
        status: 'active',
      },
    });
    console.error('Seeded super admin:', email);
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
