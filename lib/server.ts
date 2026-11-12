import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes, randomInt, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error("Missing Supabase server configuration");
export const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const pepper = process.env.TOKEN_PEPPER!;
const key = Buffer.from(process.env.ASSIGNMENT_ENCRYPTION_KEY_BASE64 || "", "base64");
if (!pepper || key.length !== 32) throw new Error("TOKEN_PEPPER and a 32-byte ASSIGNMENT_ENCRYPTION_KEY_BASE64 are required");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const tokenHash = (token: string) => createHmac("sha256", pepper).update(token).digest("hex");
export function encryptRecipient(recipientId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(recipientId, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString("base64url")).join(".");
}
export function decryptRecipient(value: string) {
  const [iv, tag, data] = value.split(".").map(x => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export async function csrfOk() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
export async function adminSession() {
  const c = await cookies();
  const raw = c.get("ss_admin")?.value;
  if (!raw) return false;
  const { data } = await db.from("admin_sessions").select("expires_at").eq("token_hash", tokenHash(raw)).maybeSingle();
  return !!data && new Date(data.expires_at).getTime() > Date.now();
}
export async function playerSession() {
  const c = await cookies();
  const raw = c.get("ss_device")?.value;
  if (!raw) return null;
  const { data } = await db.from("device_sessions").select("participant_id,expires_at").eq("token_hash", tokenHash(raw)).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.participant_id as string;
}
export function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function cleanText(v: unknown, max = 120) {
  if (typeof v !== "string") throw new Error("Invalid text");
  const s = v.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!s || s.length > max) throw new Error("Text length is invalid");
  return s;
}
export function validUrl(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.length > 1000) throw new Error("Invalid URL");
  const u = new URL(v);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https links are allowed");
  return u.toString();
}
export async function rateLimit(scope: string, limit = 12, windowSeconds = 60) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${scope}:${ip}`;
  const { data, error } = await db.rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
  if (error) throw new Error(error.message || "Rate limit check failed");
  if (data !== true) throw new Error("Too many requests. Please wait and try again.");
}
export function noStoreHeaders() {
  return { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" };
}
