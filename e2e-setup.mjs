// Pre-test cleanup: hard-delete the pending test super admin so the e2e test can register fresh
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually
const envPath = resolve(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=["']?(.+?)["']?\s*$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const EMAIL = 'superadmin-e2e@textile.test';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  const deleted = await prisma.user.deleteMany({
    where: { email: EMAIL },
  });
  console.log(`Cleaned up ${deleted.count} record(s) for ${EMAIL}`);
} finally {
  await prisma.$disconnect();
}
