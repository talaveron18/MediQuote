import { spawnSync } from 'node:child_process'
import { getConnectionString } from '@netlify/database'

const databaseUrl = process.env.DATABASE_URL?.trim() || getConnectionString()

if (!databaseUrl) {
  throw new Error('Netlify Database no ha proporcionado una cadena de conexión para el despliegue')
}

const env = { ...process.env, DATABASE_URL: databaseUrl }

function run(command, args) {
  const result = spawnSync(command, args, {
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npx', ['prisma', 'generate'])
run('npx', ['prisma', 'db', 'push', '--skip-generate'])
run('npx', ['tsx', 'scripts/seed.ts'])
run('npx', ['next', 'build'])
