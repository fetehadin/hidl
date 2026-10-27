import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LETTER_META_COLUMNS, LetterSealedError, getLetterMeta, listLetters, openLetter } from "@/lib/data/letters";
import { anon, createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

const SECRET = "the secret body that must stay sealed";

let me: TestUser;
let other: TestUser;
let sealedId: string;

async function insertLetter(user: TestUser, unlockAt: string, body = SECRET) {
  const { data, error } = await user.client
    .from("letters")
    .insert({ title: "To future me", recipient: "Future me", body, unlock_at: unlockAt })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
  sealedId = await insertLetter(me, inSeconds(60 * 60 * 24 * 30));
});

afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("a sealed letter's body is not retrievable before unlock_at", () => {
  it("select=* is refused because body is not readable", async () => {
    const { data, error } = await me.client.from("letters").select("*").eq("id", sealedId);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("selecting body explicitly is refused", async () => {
    const { data, error } = await me.client.from("letters").select("id, body").eq("id", sealedId);
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("filtering on body (to guess its contents) is refused", async () => {
    const { error } = await me.client.from("letters").select("id").like("body", "%secret%");
    expect(error?.code).toBe("42501");
  });

  it("raw REST request for body is refused", async () => {
    const { data: session } = await me.client.auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/letters?select=body&id=eq.${sealedId}`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          Authorization: `Bearer ${session.session!.access_token}`,
        },
      },
    );
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain(SECRET);
  });

  it("metadata (title, recipient, unlock_at) is readable", async () => {
    const meta = await getLetterMeta(me.client, sealedId);
    expect(meta).toMatchObject({ title: "To future me", recipient: "Future me", opened_at: null });
    expect(Object.keys(meta!)).not.toContain("body");
    const list = await listLetters(me.client);
    expect(JSON.stringify(list)).not.toContain(SECRET);
  });

  it("open_letter refuses while sealed and does not mark it opened", async () => {
    await expect(openLetter(me.client, sealedId)).rejects.toBeInstanceOf(LetterSealedError);
    const meta = await getLetterMeta(me.client, sealedId);
    expect(meta?.opened_at).toBeNull();
  });

  it("the contents cannot be edited, even via update", async () => {
    const { error } = await me.client.from("letters").update({ body: "changed" }).eq("id", sealedId);
    expect(error?.code).toBe("42501");
    const { error: titleError } = await me.client.from("letters").update({ title: "x" }).eq("id", sealedId);
    expect(titleError?.code).toBe("42501");
  });

  it("opened_at cannot be set by the client to fake an open", async () => {
    const { error } = await me.client
      .from("letters")
      .update({ opened_at: new Date().toISOString() })
      .eq("id", sealedId);
    expect(error?.code).toBe("42501");
  });

  it("unlock_at can move later but never earlier", async () => {
    const meta = await getLetterMeta(me.client, sealedId);
    const later = new Date(new Date(meta!.unlock_at).getTime() + 86_400_000).toISOString();
    const earlier = inSeconds(5);

    const moveEarlier = await me.client.from("letters").update({ unlock_at: earlier }).eq("id", sealedId);
    expect(moveEarlier.error?.message).toMatch(/only move later/);

    const moveLater = await me.client.from("letters").update({ unlock_at: later }).eq("id", sealedId).select("unlock_at");
    expect(moveLater.error).toBeNull();
    expect(new Date(moveLater.data![0].unlock_at).toISOString()).toBe(later);
  });

  it("a letter cannot be created already unlocked", async () => {
    const { error } = await me.client
      .from("letters")
      .insert({ title: "t", recipient: "r", body: "b", unlock_at: inSeconds(-60) });
    expect(error?.message).toMatch(/future/);
  });

  it("another user can neither see nor open it", async () => {
    expect(await getLetterMeta(other.client, sealedId)).toBeNull();
    await expect(openLetter(other.client, sealedId)).rejects.toMatchObject({ code: "P0002" });
    const del = await other.client.from("letters").delete().eq("id", sealedId).select("id");
    expect(del.data).toEqual([]);
  });

  it("anonymous requests get nothing", async () => {
    const { data, error } = await anon().from("letters").select(LETTER_META_COLUMNS);
    expect(data ?? []).toEqual([]);
    expect(error?.code ?? "42501").toBe("42501");
    const rpc = await anon().rpc("open_letter", { letter_id: sealedId });
    expect(rpc.data).toBeNull();
    expect(rpc.error).not.toBeNull();
  });
});

describe("once unlock_at passes", () => {
  it("open_letter returns the body and records opened_at once", async () => {
    const id = await insertLetter(me, inSeconds(2), "now you can read me");
    await expect(openLetter(me.client, id)).rejects.toBeInstanceOf(LetterSealedError);

    await sleep(2500);
    const first = await openLetter(me.client, id);
    expect(first.body).toBe("now you can read me");
    expect(first.opened_at).not.toBeNull();

    const second = await openLetter(me.client, id);
    expect(second.opened_at).toBe(first.opened_at);

    // Still unreadable through the table itself, and its date is now frozen.
    const direct = await me.client.from("letters").select("body").eq("id", id);
    expect(direct.error?.code).toBe("42501");
    const move = await me.client.from("letters").update({ unlock_at: inSeconds(3600) }).eq("id", id);
    expect(move.error?.message).toMatch(/already unlocked/);
  });

  it("letters can be deleted", async () => {
    const id = await insertLetter(me, inSeconds(3600));
    const { data, error } = await me.client.from("letters").delete().eq("id", id).select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id }]);
  });
});
