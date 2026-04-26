export function getSuperAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

export function isSuperAdminEmail(email: string): boolean {
  return getSuperAdminEmails().some(
    (e) => e.toLowerCase() === email.toLowerCase(),
  );
}
