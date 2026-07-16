import { PrismaClient } from '@prisma/client'
import { getConnectionString } from '@netlify/database'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function connectionString(): string | undefined {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim()
  return getConnectionString()
}

const datasourceUrl = connectionString()
export const db = globalForPrisma.prisma ?? new PrismaClient(
  datasourceUrl ? { datasourceUrl } : undefined,
)

