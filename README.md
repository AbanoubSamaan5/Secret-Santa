# Secret Santa — private draw app

A Next.js + Supabase implementation with two shareable URLs:
- Players: `/play`
- Admin: `/admin/<one-time-secret-token>`; it exchanges the token for an HTTP-only session and redirects to `/admin`.

## Important security boundary

This implementation protects assignments from database-only readers and from the admin dashboard: recipient IDs are encrypted with AES-256-GCM before storage, and the admin APIs never return them. The server hosting environment necessarily has the encryption key and can decrypt assignments; no software architecture can both serve a personalized result and make it unknowable to the server operator. Protect hosting/Supabase project access accordingly.

The application uses a same-origin Next.js API layer so `Secure; HttpOnly; SameSite=Strict` cookies work without cross-site cookie exceptions. Do not move API routes to a separate domain without redesigning cookie handling.

## Requirements

- Node.js 20.9+
- Supabase project
- Vercel (recommended) or another Node-compatible Next.js host

## Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Supabase project settings, copy the Project URL and `service_role` secret.
4. Copy `.env.example` to `ocal`.
5. Generate secrets:
   ```bash
   openssl rand -base64 32
   openssl rand -hex 48
   ```
   Use the base64 value for `ASSIGNMENT_ENCRYPTION_KEY_BASE64` and the hex value for `TOKEN_PEPPER`. The encryption key must decode to exactly 32 bytes.
6. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_PEPPER`, `ASSIGNMENT_ENCRYPTION_KEY_BASE64`, and `NEXT_PUBLIC_APP_URL`.
7. Install and run:
   ```bash
   npm install
   npm run dev
   ```
8. Generate the admin token after setting `TOKEN_PEPPER` and `NEXT_PUBLIC_APP_URL`:
   ```bash
   npm run admin-token
   ```
   Run the printed SQL statement in Supabase SQL Editor. Save the printed admin URL securely. The token is shown once; if lost, generate a new one and rerun the SQL.
9. Deploy to Vercel. Add the same environment variables in Project Settings → Environment Variables, then redeploy.
10. Share `https://YOUR-DOMAIN/play` with players. Keep `https://YOUR-DOMAIN/admin/<token>` private.

## Importing names

Open the admin link, paste one name per line or upload TXT/CSV. The importer accepts 3–500 names. Repeated names are given labels such as `Mona (2)`. Review the list before pressing Start Game. The list locks permanently after the draw.

## Privacy model

- Admin UI receives names, join status/time, and wishlist yes/no + item count only.
- Player `me` endpoint decrypts only the current player's own assignment.
- Recipient wishlist endpoint returns only wishlist items/preferences, never recipient ID, giver identity, or assignment mapping.
- A player cannot query the person who drew them.
- Device credentials are random 256-bit tokens in HTTP-only cookies; only HMAC hashes are stored.
- Database RLS denies `anon` and `authenticated` direct table access. The service role key is server-only.
- Assignment rows contain AES-256-GCM ciphertext, not readable recipient IDs.
- All API responses are no-store; security headers include no-referrer and noindex metadata.

## Operational hardening before a public launch

This is a deployable baseline, but a high-assurance production deployment should also:
- Put the app behind a WAF (e.g. Vercel Firewall/Cloudflare) and configure trusted proxy IP handling. The included fixed-window limiter uses `x-forwarded-for`; verify your host overwrites this header rather than trusting client-supplied values.
- Add CAPTCHA or invite controls if the public link may be attacked.
- Add a security alert/backup policy and rotate secrets using a planned migration.
- Use a custom domain so the app and API remain same-origin.
- Enable Supabase PITR/backups appropriate to the event.
- Add automated integration tests and a security review before handling a large group.
- Do not grant the admin token to participants. Do not expose server env vars or Supabase service role key.

## Test plan

1. **Player A cannot see Player B's result:** claim A; call `/api/player/me` with A's cookie. It returns A's recipient only. There is no API accepting another participant ID for result lookup. Direct DB reads as anon/authenticated are denied by RLS.
2. **Player A cannot read the wishlist of whoever drew them:** the recipient-wishlist endpoint decrypts A's own recipient and returns that recipient's wishlist. It never queries incoming assignments. No endpoint exposes the inverse mapping.
3. **Second device cannot see a claimed name's result:** claim a name on device 1. Device 2 has no valid `ss_device` cookie; the name is unavailable and `/api/player/me` rejects it.
4. **No admin endpoint returns assignments:** inspect `/api/admin/state`; it returns participant status and wishlist aggregates only. The admin route never selects from `assignments`.
5. **Reset preserves original result:** reset removes device session(s) and marks the name available. Claim the same name from a new device; `/api/player/me` decrypts the same immutable assignment row.
6. **Atomic claim:** send concurrent claims for the same participant. Only one conditional `UPDATE ... WHERE claim_status='available'` can succeed.
7. **Derangement/full cycle:** after starting with N participants, verify in a secure test environment that every encrypted assignment decrypts to a different participant and each participant appears exactly once as recipient. Never run this audit through a public endpoint or log mappings.
8. **Admin token exchange:** open `/admin/<token>`, confirm redirect to `/admin`, inspect cookie flags (`HttpOnly`, `Secure` in production, `SameSite=Strict`), and verify the raw token is absent from browser URL/history after redirect.

## Known scope notes

- Admin token exchange uses a GET because it is a one-time link exchange; the token is validated, immediately replaced by a session cookie, and redirected. Referrer policy and no-store are applied.
- Admin participant import is intended before the game starts. Duplicate labels are deterministic.
- Wishlist updates replace the current list atomically at the application level; for strict transactional replacement, move the operation into a Postgres RPC transaction.
- For strict atomicity across claim + device-session insertion, the production upgrade is to move both operations into one Postgres function/transaction. The current conditional update prevents double-claim, and compensates if session insertion fails.
- Polling is used instead of realtime so no direct database subscriptions are exposed.
