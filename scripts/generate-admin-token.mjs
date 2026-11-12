import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim();
  }
}

const token = crypto.randomBytes(32).toString("base64url");
const pepper = process.env.TOKEN_PEPPER;
if (!pepper) {
  console.error("TOKEN_PEPPER is missing. Add it to .env.local first.");
  process.exit(1);
}
const hash = crypto.createHmac("sha256", pepper).update(token).digest("hex");
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
console.log("\nONE-TIME ADMIN URL (copy and store securely):");
console.log(`${base}/admin/${token}`);
console.log("\nRun this SQL in Supabase SQL Editor (hash only):");
console.log(`insert into public.admin_token(id, token_hash) values (1, '${hash}') on conflict (id) do update set token_hash = excluded.token_hash;`);
console.log("\nThe raw token is not stored in the database. Keep the URL private.");
  