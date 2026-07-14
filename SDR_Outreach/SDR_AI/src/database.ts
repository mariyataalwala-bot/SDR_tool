import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/**
 * Helper to check database connection health.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    // Run a simple query
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('[Database] Connection health check failed:', error);
    return false;
  }
}
