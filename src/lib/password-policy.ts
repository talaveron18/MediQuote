export const MINIMUM_PASSWORD_LENGTH = 12;

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= MINIMUM_PASSWORD_LENGTH;
}
