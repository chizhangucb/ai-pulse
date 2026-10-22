// Creates .env from .env.example with fresh random secrets and an admin password, and prints the password
// once. Refuses to overwrite an existing .env.   node scripts/init-env.ts [--llm-key <key>]
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.error(".env already exists and was left as is. To generate a new one, rename or delete it first.");
  process.exit(1);
}
const password = randomBytes(12).toString("base64url");
const keyAt = process.argv.indexOf("--llm-key");
const llmKey = keyAt > 0 ? (process.argv[keyAt + 1] ?? "") : "";
const text = readFileSync(".env.example", "utf8")
  .replace(/^ADMIN_PASSWORD=$/m, `ADMIN_PASSWORD=${password}`)
  .replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${randomBytes(32).toString("hex")}`)
  .replace(/^IMG_PROXY_SIGN_SECRET=$/m, `IMG_PROXY_SIGN_SECRET=${randomBytes(32).toString("hex")}`)
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${randomBytes(18).toString("hex")}`)
  .replace(/^LLM_API_KEY=$/m, `LLM_API_KEY=${llmKey}`);
writeFileSync(".env", text, { mode: 0o600 });
console.log("Wrote .env.");
console.log(`Admin password: ${password} (also saved as ADMIN_PASSWORD in .env)`);
if (!llmKey) console.log("One step left: set LLM_API_KEY in .env (an OpenRouter key; LLM_BASE_URL and LLM_MODEL default to OpenRouter with Claude Haiku 5.5, reasoning off).");
