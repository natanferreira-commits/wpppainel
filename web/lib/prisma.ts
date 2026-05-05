import { PrismaClient } from '@prisma/client';

// Singleton pattern pra evitar criar uma nova conexão a cada hot-reload
// em dev e a cada invocation em serverless. Reusa a mesma instância
// dentro do mesmo container Lambda do Vercel.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
