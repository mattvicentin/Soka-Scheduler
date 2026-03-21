import { prisma } from "./db/client";
import { CONFIG_KEYS } from "./constants/config-keys";

export async function getConfig<T>(key: string): Promise<T | null> {
  const row = await prisma.systemConfig.findUnique({
    where: { key },
  });
  return (row?.value as T) ?? null;
}

export async function getConfigWithDefault<T>(key: string, defaultValue: T): Promise<T> {
  const value = await getConfig<T>(key);
  return value ?? defaultValue;
}

// Convenience getters for typed config
export async function getAllowedStartMinutes(): Promise<number[]> {
  const val = await getConfigWithDefault<unknown>(CONFIG_KEYS.ALLOWED_START_MINUTES, [
    0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
  ]);
  if (Array.isArray(val)) {
    return val.map((m) => (typeof m === "number" ? m : parseInt(String(m), 10))).filter((n) => !Number.isNaN(n));
  }
  return [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
}

export async function getMaxClassDurationMinutes(): Promise<number> {
  return getConfigWithDefault(CONFIG_KEYS.MAX_CLASS_DURATION_MINUTES, 180);
}

export async function getCrowdedSlotThreshold(): Promise<number> {
  return getConfigWithDefault(CONFIG_KEYS.CROWDED_SLOT_THRESHOLD, 3);
}

/** Crowded time period: "warn" = allow save with advisory; "block" = hard error. Default: warn. */
export async function getCrowdedPeriodPolicy(): Promise<"warn" | "block"> {
  const val = await getConfigWithDefault<string>(CONFIG_KEYS.CROWDED_PERIOD_POLICY, "warn");
  return val === "block" ? "block" : "warn";
}
