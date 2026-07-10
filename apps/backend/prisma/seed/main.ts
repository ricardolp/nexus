import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './tasks/auth.seed-admin';
import { seedFromLegacyNfe } from './tasks/fiscal.seed-from-legacy-nfe';
import { seedInboundNfeMocks } from './tasks/fiscal.seed-inbound-mocks';
import { seedNovaConsultingOrganization } from './tasks/organization.seed-nova-consulting';
import { seedOrganizationIntegrationPermissions } from './tasks/organization.seed-integration-permissions';

type SeedTask = (prisma: PrismaClient) => Promise<void>;

const seedTasks: SeedTask[] = [
  seedAdmin,
  seedNovaConsultingOrganization,
  seedOrganizationIntegrationPermissions,
  seedInboundNfeMocks,
  seedFromLegacyNfe,
];

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run prisma/seed/main.ts');
  }

  if (!process.env.LEGACY_DATABASE_URL) {
    console.warn(
      '[seed] LEGACY_DATABASE_URL is not set — NFe legacy migration will be skipped',
    );
  }

  for (const task of seedTasks) {
    await task(prisma);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
