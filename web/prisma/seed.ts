// CLI wrapper — chama seedDatabase() com um PrismaClient próprio.
// Em prod, o seed roda via endpoint /api/admin/seed.

import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../lib/seed';

const prisma = new PrismaClient();

async function main() {
  const summary = await seedDatabase(prisma);
  console.log('Seed pronto:');
  console.log(`  Users: ${summary.users.join(' / ')}`);
  console.log(`  Instance: ${summary.instance}`);
  console.log(`  Community: ${summary.community}`);
  console.log(`  Groups: ${summary.groups}`);
  console.log(`  Métricas (30d): ${summary.metrics}`);
  console.log(`  Eventos JOIN/LEFT: ${summary.events}`);
  console.log(`  Mensagens passadas: ${summary.messages}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
