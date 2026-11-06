/** A completed curve is graduated only once the provider reports a destination pool. */
export function launchStage(value: unknown): { stage: "bonding" | "graduated" | null; progress: number | null; destination: string | null } {
  const details = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const raw = details.graduation_percentage;
  const progress = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
  const destination = typeof details.migrated_destination_pool_address === "string" ? details.migrated_destination_pool_address : null;
  if (details.completed === true && destination) return { stage: "graduated", progress, destination };
  if (details.completed === false && progress !== null && progress < 100 && !destination) return { stage: "bonding", progress, destination: null };
  return { stage: null, progress, destination: null };
}
