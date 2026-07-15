import { randomBytes } from 'node:crypto';

export function generateTemporaryPassword(): string {
  return `Gasi-${randomBytes(18).toString('base64url')}!`;
}
