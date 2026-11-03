export type LaunchDraft = { name: string; ticker: string; description: string; website: string; x: string; image: string };
export const EMPTY_DRAFT: LaunchDraft = { name: "", ticker: "", description: "", website: "", x: "", image: "" };
export const DRAFT_KEY = "rilo-launch-draft";

export function validateDraft(draft: LaunchDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim() || draft.name.trim().length > 32) errors.push("Enter a token name of 1–32 characters.");
  if (!/^[A-Z0-9]{2,10}$/.test(draft.ticker)) errors.push("Ticker must contain 2–10 uppercase letters or numbers.");
  if (draft.description.length > 500) errors.push("Description must be 500 characters or fewer.");
  if (draft.website) {
    try {
      const url = new URL(draft.website);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
    } catch { errors.push("Enter a valid http or https website URL."); }
  }
  if (draft.x && !/^[A-Za-z0-9_]{1,15}$/.test(draft.x)) errors.push("X username must be 1–15 letters, numbers, or underscores.");
  if (draft.image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(draft.image) || draft.image.length > 2_800_000)) errors.push("Use a PNG, JPG, or WebP image up to 2 MB.");
  return errors;
}

export function readDraft(value: unknown): LaunchDraft {
  if (!value || typeof value !== "object") return { ...EMPTY_DRAFT };
  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(EMPTY_DRAFT).map(key => [key, typeof record[key] === "string" ? record[key] : ""])) as LaunchDraft;
}
