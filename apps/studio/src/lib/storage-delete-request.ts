import { z } from "zod";

export const storageDeleteInputSchema = z.object({
  confirm: z.literal(true),
  files: z.array(z.object({ key: z.string().regex(/^media\/assets\/[a-f0-9]{64}\.mp4$/), version: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(100),
});
export function storageDeleteOriginAllowed(request: Request, configuredUrl?: string) {
  try { return request.headers.get("origin") === new URL(configuredUrl ?? request.url).origin; }
  catch { return false; }
}
