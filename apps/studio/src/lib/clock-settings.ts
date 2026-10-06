import { z } from "zod";
import { withDatabase } from "./db.ts";

export class ClockError extends Error { readonly status = 400; }
// Ecuador no tiene horario de verano: UTC-5 todo el año.
export const DEFAULT_CLOCK_TIMEZONE = "America/Guayaquil";
export const clockSettingsSchema = z.object({
  timezone: z.string().max(100).refine((zone) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } }),
});
export type ClockSettings = z.infer<typeof clockSettingsSchema>;

export async function getClockSettings(): Promise<ClockSettings> {
  const row = await withDatabase((db) => db.prepare("SELECT data_json FROM studio_settings WHERE key = 'clock'").get()) as { data_json: string } | undefined;
  return row ? clockSettingsSchema.parse(JSON.parse(row.data_json)) : { timezone: DEFAULT_CLOCK_TIMEZONE };
}
export async function saveClockSettings(input: unknown) {
  const parsed = clockSettingsSchema.safeParse(input);
  if (!parsed.success) throw new ClockError("Zona horaria inválida.");
  await withDatabase((db) => db.prepare("INSERT INTO studio_settings (key, data_json) VALUES ('clock', ?) ON CONFLICT (key) DO UPDATE SET data_json = EXCLUDED.data_json").run(JSON.stringify(parsed.data)));
  return parsed.data;
}
