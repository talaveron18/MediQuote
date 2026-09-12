export const MINIMUM_PASSWORD_LENGTH = 12;
// bcrypt only incorporates the first 72 UTF-8 bytes. Reject longer inputs so
// two visually different passwords can never collapse to the same bcrypt input.
export const MAXIMUM_PASSWORD_BYTES = 72;

export function passwordUtf8Bytes(password: string): number {
  return new TextEncoder().encode(password).byteLength;
}

export function isStrongEnoughPassword(password: string): boolean {
  return password.length >= MINIMUM_PASSWORD_LENGTH && passwordUtf8Bytes(password) <= MAXIMUM_PASSWORD_BYTES;
}
