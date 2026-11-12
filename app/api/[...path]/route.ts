import { NextRequest, NextResponse } from "next/server";
import { db, randomToken, tokenHash, encryptRecipient, decryptRecipient, playerSession, adminSession, csrfOk, shuffle, cleanText, validUrl, rateLimit, noStoreHeaders } from "@/lib/server";

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStoreHeaders() });
const errorMessage = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Request failed";
};
const err = (e: unknown, status = 400) => json({ error: errorMessage(e) }, status);
const adminCookie = (res: NextResponse, token: string) => res.cookies.set("ss_admin", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 8 });
const deviceCookie = (res: NextResponse, token: string) => res.cookies.set("ss_device", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 365 });

async function requireAdmin() { if (!(await adminSession())) throw new Error("Unauthorized"); }
async function requirePlayer() {
  const id = await playerSession();
  if (!id) throw new Error("No active player session");
  return id;
}
async function getOwnAssignment(giverId: string) {
  const { data, error } = await db.from("assignments").select("recipient_ciphertext").eq("giver_id", giverId).single();
  if (error || !data) throw new Error("Assignment unavailable");
  const recipientId = decryptRecipient(data.recipient_ciphertext);
  const { data: recipient, error: re } = await db.from("participants").select("id,display_name").eq("id", recipientId).single();
  if (re || !recipient) throw new Error("Recipient unavailable");
  return recipient as { id: string; display_name: string };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const action = path.join("/");
    if (action === "admin/exchange") {
      const token = req.nextUrl.searchParams.get("token") || "";
      await rateLimit("admin-exchange", 8, 60);
      const { data } = await db.from("admin_token").select("token_hash").eq("id", 1).single();
      if (!data || tokenHash(token) !== data.token_hash) return err(new Error("Invalid admin link"), 401);
      const session = randomToken(32);
      await db.from("admin_sessions").insert({ token_hash: tokenHash(session), expires_at: new Date(Date.now() + 8*3600*1000).toISOString() });
      const res = NextResponse.redirect(new URL("/admin", req.url), 303);
      adminCookie(res, session);
      res.headers.set("Referrer-Policy", "no-referrer");
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    if (action === "admin/state") {
      await requireAdmin();
    
      const { data: game } = await db
        .from("game_state")
        .select("started_at")
        .eq("id", 1)
        .single();
    
      const { data: people, error } = await db
        .from("participants")
        .select("id,display_name,claim_status,joined_at,reset_at")
        .order("created_at");
    
      if (error) throw error;
    
      const { data: counts } = await db
        .from("wishlist_stats")
        .select("participant_id,item_count,has_wishlist");
    
      const countMap = new Map(
        (counts || []).map(x => [x.participant_id, x])
      );
    
      // Only the authenticated admin can retrieve assignments.
      const { data: assignments, error: assignmentError } = await db
        .from("assignments")
        .select("giver_id,recipient_ciphertext");
    
      if (assignmentError) throw assignmentError;
    
      // Decrypt recipient IDs and build the assignment lookup.
      const assignmentMap = new Map<string, string>();
    
      for (const assignment of assignments || []) {
        assignmentMap.set(
          assignment.giver_id,
          decryptRecipient(assignment.recipient_ciphertext)
        );
      }
    
      // Fetch recipient names.
      const recipientIds = [...new Set(assignmentMap.values())];
    
      const { data: recipients, error: recipientError } =
        recipientIds.length
          ? await db
              .from("participants")
              .select("id,display_name")
              .in("id", recipientIds)
          : { data: [], error: null };
    
      if (recipientError) throw recipientError;
    
      const recipientMap = new Map(
        (recipients || []).map(p => [p.id, p.display_name])
      );
    
      const rows = (people || []).map(p => {
        const recipientId = assignmentMap.get(p.id);
    
        return {
          id: p.id,
          name: p.display_name,
          status: p.reset_at
            ? "Reset"
            : p.claim_status === "claimed"
              ? "Joined"
              : "Not yet",
          joinedAt: p.joined_at,
    
          drawnPerson: recipientId
            ? {
                id: recipientId,
                name: recipientMap.get(recipientId) || "Unknown"
              }
            : null,
    
          wishlist: {
            hasItems: !!countMap.get(p.id)?.has_wishlist,
            count: countMap.get(p.id)?.item_count || 0
          }
        };
      });
    
      return json({
        started: !!game?.started_at,
        participants: rows,
        joined: rows.filter(x => x.status === "Joined").length,
        total: rows.length
      });
    }
    
    if (action === "player/list") {
      await rateLimit("player-list", 30, 60);
      const existing = await playerSession();
      if (existing) return json({ alreadyClaimed: true });
      const { data, error } = await db.from("participants").select("id,display_name,claim_status").order("display_name");
      if (error) throw error;
      return json({ alreadyClaimed: false, participants: (data || []).map(p => ({ id: p.id, name: p.display_name, available: p.claim_status === "available" })) });
    }
    if (action === "player/me") {
      const id = await requirePlayer();
      const person = await getOwnAssignment(id);
      const { data: ownItems } = await db.from("wishlists").select("id,title,url,note,approx_price,sort_order").eq("owner_id", id).order("sort_order");
      const { data: ownPref } = await db.from("wishlist_preferences").select("anything_is_fine").eq("participant_id", id).maybeSingle();
      return json({ name: (await db.from("participants").select("display_name").eq("id", id).single()).data?.display_name, recipient: person.display_name, ownWishlist: ownItems || [], anythingIsFine: !!ownPref?.anything_is_fine });
    }
    if (action === "player/recipient-wishlist") {
      await rateLimit("wishlist-read", 30, 60);
      const id = await requirePlayer();
      const recipient = await getOwnAssignment(id);
      const { data: items, error } = await db.from("wishlists").select("title,url,note,approx_price,sort_order").eq("owner_id", recipient.id).order("sort_order");
      if (error) throw error;
      const { data: pref } = await db.from("wishlist_preferences").select("anything_is_fine").eq("participant_id", recipient.id).maybeSingle();
      return json({ items: items || [], anythingIsFine: !!pref?.anything_is_fine });
    }
    return err(new Error("Not found"), 404);
  } catch (e) { return err(e, e instanceof Error && e.message === "Unauthorized" ? 401 : 400); }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await ctx.params;
    const action = path.join("/");
    if (!(await csrfOk())) return err(new Error("CSRF validation failed"), 403);
    const body = await req.json().catch(() => ({}));

    if (action === "admin/import") {
      await requireAdmin();
      const { data: game } = await db.from("game_state").select("started_at").eq("id", 1).single();
      if (game?.started_at) return err(new Error("The game has started; names are locked"), 409);
      if (!Array.isArray(body.names)) throw new Error("Names must be an array");
      const names = body.names.map((n: unknown) => cleanText(n, 80)).filter(Boolean);
      if (names.length < 3 || names.length > 500) throw new Error("Enter between 3 and 500 names");
      const seen = new Map<string, number>();
      const unique = names.map((name: string) => {
        const k = name.toLocaleLowerCase();
        const n = (seen.get(k) || 0) + 1; seen.set(k, n);
        return n === 1 ? name : `${name} (${n})`;
      });
      const { error: delError } = await db.from("participants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delError) throw delError;
      const { error } = await db.from("participants").insert(unique.map((display_name: string) => ({ display_name })));
      if (error) throw error;
      return json({ imported: unique.length, duplicatesAdjusted: unique.length !== new Set(names.map((n: string) => n.toLocaleLowerCase())).size });
    }
    if (action === "admin/start") {
      await requireAdmin();
      const { data: game } = await db.from("game_state").select("started_at").eq("id", 1).single();
      if (game?.started_at) return err(new Error("Game already started"), 409);
      const { data: people, error } = await db.from("participants").select("id").order("created_at");
      if (error) throw error;
      if (!people || people.length < 3) throw new Error("At least 3 participants are required");
      // Fisher-Yates with crypto.randomInt, then a single cycle: each participant gives and receives exactly once.
      const cycle = shuffle(people.map(p => p.id));
      const rows = cycle.map((giver, i) => ({ giver_id: giver, recipient_ciphertext: encryptRecipient(cycle[(i + 1) % cycle.length]) }));
      const { error: insertError } = await db.from("assignments").insert(rows);
      if (insertError) throw insertError;
      const { error: updateError } = await db.from("game_state").update({ started_at: new Date().toISOString() }).eq("id", 1).is("started_at", null);
      if (updateError) throw updateError;
      return json({ started: true });
    }
    if (action === "admin/reset") {
      await requireAdmin();
      const id = cleanText(body.participantId, 64);
      const { data: p } = await db.from("participants").select("id").eq("id", id).single();
      if (!p) throw new Error("Participant not found");
      await db.from("device_sessions").delete().eq("participant_id", id);
      const { error } = await db.from("participants").update({ claim_status: "available", reset_at: new Date().toISOString(), joined_at: null }).eq("id", id);
      if (error) throw error;
      return json({ reset: true });
    }
    if (action === "player/claim") {
      await rateLimit("claim", 8, 60);
      if (await playerSession()) throw new Error("This device has already claimed a name");
      const { data: game } = await db.from("game_state").select("started_at").eq("id", 1).maybeSingle();
      if (!game?.started_at) throw new Error("The game has not started yet");
      const id = cleanText(body.participantId, 64);
      const deviceToken = randomToken(32);
      // Conditional UPDATE is the atomic claim gate; exactly one concurrent request can change available -> claimed.
      const { data, error } = await db.from("participants").update({ claim_status: "claimed", joined_at: new Date().toISOString(), reset_at: null }).eq("id", id).eq("claim_status", "available").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return err(new Error("That name has already been claimed"), 409);
      const { error: sessionError } = await db.from("device_sessions").insert({ participant_id: id, token_hash: tokenHash(deviceToken), expires_at: new Date(Date.now() + 365*86400000).toISOString() });
      if (sessionError) {
        await db.from("participants").update({ claim_status: "available", joined_at: null }).eq("id", id);
        throw sessionError;
      }
      const res = NextResponse.json({ claimed: true }, { headers: noStoreHeaders() });
      deviceCookie(res, deviceToken);
      return res;
    }
    if (action === "player/wishlist") {
      const id = await requirePlayer();
      if (!Array.isArray(body.items) || body.items.length > 10) throw new Error("A wishlist can contain up to 10 items");
      const items = body.items.map((item: any, i: number) => ({
        owner_id: id, title: cleanText(item.title, 100), url: validUrl(item.url),
        note: item.note ? cleanText(item.note, 300) : null,
        approx_price: item.approxPrice ? cleanText(item.approxPrice, 40) : null, sort_order: i
      }));
      const { error: delError } = await db.from("wishlists").delete().eq("owner_id", id);
      if (delError) throw delError;
      if (items.length) {
        const { error } = await db.from("wishlists").insert(items);
        if (error) throw error;
      }
      const { error: prefError } = await db.from("wishlist_preferences").upsert({ participant_id: id, anything_is_fine: !!body.anythingIsFine });
      if (prefError) throw prefError;
      return json({ saved: true });
    }
    return err(new Error("Not found"), 404);
  } catch (e) { return err(e, e instanceof Error && e.message === "Unauthorized" ? 401 : 400); }
}
