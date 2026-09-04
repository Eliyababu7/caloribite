export const MINIMUM_PASSWORD_LENGTH = 8;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateNewPassword(value: string): string | null {
  if (value.length < MINIMUM_PASSWORD_LENGTH) {
    return `Create a password with at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

export function passwordsMatch(password: string, confirmation: string) {
  return password === confirmation;
}
