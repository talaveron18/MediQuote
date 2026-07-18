import 'dotenv/config';
import { db } from '../src/lib/db';
import { generateTemporaryPassword } from '../src/lib/password';
import bcrypt from 'bcryptjs';

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.NETLIFY) {
    throw new Error('Este restablecimiento solo puede ejecutarse en desarrollo local.');
  }

  const email = 'fernando.suarez@gasisalud.com';
  const maestro = await db.user.findUnique({ where: { email } });
  if (!maestro) {
    throw new Error(`No existe ${email}. Ejecuta primero npm run seed.`);
  }

  const password = generateTemporaryPassword();
  await db.user.update({
    where: { id: maestro.id },
    data: { password: await bcrypt.hash(password, 12), active: true, mustChangePassword: true },
  });

  console.log('');
  console.log('Acceso Build Week restablecido:');
  console.log(`Usuario: ${email}`);
  console.log(`Contraseña temporal: ${password}`);
  console.log('La aplicación pedirá cambiarla al iniciar sesión.');
  console.log('');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
