// The deployed commit, shown on /api/health, the admin Runs page and each document. `||`, not `??`: Railway
// can resolve a variable reference to an empty string.
export function currentRelease(): string {
  return process.env.AIHOT_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || "dev";
}
