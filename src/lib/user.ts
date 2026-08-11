/**
 * This is a single-tenant personal instance — there's no auth/session yet,
 * so "the current user" is a fixed env var rather than something derived
 * per-request. `UnlockedSkill.userId` exists for forward-compatibility with
 * multi-user later, not because this app has multiple users today.
 */
export function getCurrentUserId(): string {
  const userId = process.env.DEFAULT_USER_ID;
  if (!userId) {
    throw new Error("DEFAULT_USER_ID is not set");
  }
  return userId;
}
