import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword } from './password';
import { isStrongEnoughPassword, MINIMUM_PASSWORD_LENGTH } from './password-policy';

describe('Password utilities', () => {
  it('generates distinct temporary passwords with sufficient length', () => {
    const first = generateTemporaryPassword();
    const second = generateTemporaryPassword();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(MINIMUM_PASSWORD_LENGTH);
    expect(isStrongEnoughPassword(first)).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(isStrongEnoughPassword('short')).toBe(false);
  });
});
