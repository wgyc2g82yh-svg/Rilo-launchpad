import "server-only";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { readDraft, validateDraft } from "@/lib/launch-draft";
import { address } from "@/lib/chain-transactions";
import { createLaunch, getLaunchConfig } from "@/lib/bonding-curve";
import { digest, IntegrationError, seal, trustedOrigin, unseal } from "@/lib/integration-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type ProfileTicket = { kind: "profile"; wallet: string; mint: string; profileHash: string; origin: string; expiresAt: number };
function profile(value: unknown) {
  const draft = readDraft(value); draft.name = draft.name.trim(); draft.ticker = draft.ticker.trim();
  const errors = validateDraft(draft);
  if (errors.length) throw new IntegrationError(400, errors[0]);
  return draft;
}
export function launchMessage(ticket: ProfileTicket) {
  return `RILO token profile authorization\nWebsite: ${ticket.origin}\nCreator: ${ticket.wallet}\nNew mint: ${ticket.mint}\nProfile hash: ${ticket.profileHash}\nExpires: ${new Date(ticket.expiresAt).toISOString()}\nThis message authorizes this immutable profile upload. It does not move funds.`;
}
export async function launchChallenge(body: Record<string, unknown>) {
  const wallet = address(body.wallet), mint = address(body.mint), draft = profile(body.profile);
  await getLaunchConfig();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new IntegrationError(503, "Token metadata storage is not configured.");
  const payload: ProfileTicket = { kind: "profile", wallet, mint, profileHash: digest(JSON.stringify(draft)), origin: trustedOrigin(), expiresAt: Date.now() + 5 * 60_000 };
  return { ticket: seal(payload), message: launchMessage(payload) };
}
export async function prepareLaunch(body: Record<string, unknown>) {
  const ticket = unseal<ProfileTicket>(body.ticket, "profile"), draft = profile(body.profile);
  if (ticket.profileHash !== digest(JSON.stringify(draft)) || ticket.origin !== trustedOrigin()) throw new IntegrationError(400, "The profile changed. Review and authorize it again.");
  try {
    if (typeof body.signature !== "string" || body.signature.length > 100 || !nacl.sign.detached.verify(new TextEncoder().encode(launchMessage(ticket)), bs58.decode(body.signature), new PublicKey(ticket.wallet).toBytes())) throw new Error();
  } catch { throw new IntegrationError(403, "The creator’s profile authorization could not be verified."); }
  const supabase = getSupabaseAdmin(); const bucket = process.env.TOKEN_METADATA_BUCKET || "token-metadata";
  const prefix = `${ticket.wallet}/${ticket.profileHash}`;
  async function put(path: string, bytes: Uint8Array | string, contentType: string) {
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new IntegrationError(502, "The token profile could not be stored.");
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  let image = "";
  if (draft.image) {
    const [header, encoded] = draft.image.split(","); const bytes = Buffer.from(encoded, "base64");
    const mime = header.slice(5).split(";")[0];
    const magic = mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    if (!magic || bytes.byteLength > 2 * 1024 * 1024) throw new IntegrationError(400, "The image data does not match an accepted image format.");
    image = await put(`${prefix}.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp"}`, bytes, mime);
  }
  const uri = await put(`${prefix}.json`, JSON.stringify({ name: draft.name, symbol: draft.ticker, description: draft.description, image, external_url: draft.website || undefined, extensions: { website: draft.website || undefined, twitter: draft.x ? `https://x.com/${draft.x}` : undefined } }), "application/json");
  return createLaunch(ticket.wallet, ticket.mint, draft.name, draft.ticker, uri);
}
