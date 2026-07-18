import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const sourceSchemaPath = resolve(root, 'prisma', 'schema.prisma');
const localSchemaPath = resolve(root, 'prisma', 'schema.local.prisma');
const databaseUrl = 'file:../db/build-week.db';
const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function upsertEnv(source, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(source)) return source.replace(pattern, line);
  return `${source.trimEnd()}\n${line}\n`;
}

function run(args, env) {
  execFileSync(runner, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

mkdirSync(resolve(root, 'db'), { recursive: true });

let envFile = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
envFile = upsertEnv(envFile, 'DATABASE_URL', databaseUrl);
if (!/^SESSION_SECRET=.{32,}$/m.test(envFile)) {
  envFile = upsertEnv(envFile, 'SESSION_SECRET', randomBytes(48).toString('base64'));
}
if (!/^OPENAI_DEMO_MODE=/m.test(envFile)) {
  envFile = upsertEnv(envFile, 'OPENAI_DEMO_MODE', 'true');
}
writeFileSync(envPath, envFile, 'utf8');

const sourceSchema = readFileSync(sourceSchemaPath, 'utf8');
const localSchema = sourceSchema.replace(
  'provider = "postgresql"',
  'provider = "sqlite"',
);
if (localSchema === sourceSchema) {
  throw new Error('No se encontró el proveedor PostgreSQL esperado en prisma/schema.prisma.');
}
writeFileSync(localSchemaPath, localSchema, 'utf8');

const childEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  NODE_ENV: 'development',
};

try {
  console.log('\nPreparando la base local aislada de Build Week...\n');
  run(['prisma', 'generate', '--schema', 'prisma/schema.local.prisma'], childEnv);
  run(['prisma', 'db', 'push', '--schema', 'prisma/schema.local.prisma'], childEnv);
  console.log('\nCreando los usuarios demo. Guarda las contraseñas que aparecen a continuación.\n');
  run(['tsx', 'scripts/seed.ts'], childEnv);
  console.log('\nPreparación terminada. Ejecuta: npm run dev\n');
} finally {
  if (existsSync(localSchemaPath)) unlinkSync(localSchemaPath);
}
