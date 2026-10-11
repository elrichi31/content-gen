import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase } from "../../../../scripts/test-db.mjs";

const testDb = await createTestDatabase(); process.env.DATABASE_URL = testDb.url;

const { chunkPlan, completeAuthorization, fetchDraftStatus, fetchTikTokStats, fetchTikTokVideos, startAuthorization, sumVideoMetrics, TikTokError, uploadVideoDraft } = await import("./tiktok.ts");

delete process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_SECRET;
assert.throws(() => startAuthorization(), /TIKTOK_CLIENT_KEY/, "sin credenciales no arranca el flujo");

process.env.TIKTOK_CLIENT_KEY = "clave"; process.env.TIKTOK_CLIENT_SECRET = "secreto";
process.env.TIKTOK_REDIRECT_URI = "http://localhost:3000/api/tiktok/callback";

const { url, state, verifier } = startAuthorization();
const params = new URL(url).searchParams;
assert.equal(new URL(url).origin + new URL(url).pathname, "https://www.tiktok.com/v2/auth/authorize/", "usa el endpoint v2");
assert.equal(params.get("client_key"), "clave");
assert.equal(params.get("scope"), "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload", "pide estadísticas, videos y envío a borradores");
assert.equal(params.get("state"), state, "el state viaja en la URL");
assert.equal(params.get("code_challenge"), createHash("sha256").update(verifier).digest("hex"), "TikTok exige el challenge en hex");
assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/, "el verificador cumple el rango PKCE");
assert.ok(!verifier.includes("."), "el punto separa state y verificador en la cookie");

const now = Date.parse("2026-09-19T12:00:00.000Z");
const today = new Date(now);
const tokenBody = (access: string, refresh: string) => ({ access_token: access, refresh_token: refresh, expires_in: 86400, refresh_expires_in: 31536000, open_id: "abc-123", scope: "user.info.basic,user.info.stats" });
const calls: { url: string; body?: string; auth?: string }[] = [];
const request: typeof fetch = async (input, init) => {
  const target = String(input);
  calls.push({ url: target, body: init?.body ? String(init.body) : undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  if (target.includes("/oauth/token/")) {
    return new Response(JSON.stringify(String(init?.body).includes("refresh_token") ? tokenBody("act.nuevo", "rft.nuevo") : tokenBody("act.uno", "rft.uno")));
  }
  return new Response(JSON.stringify({ data: { user: { open_id: "abc-123", follower_count: 1200, following_count: 80, likes_count: 45000, video_count: 37 } }, error: { code: "ok", message: "" } }));
};

await assert.rejects(() => fetchTikTokStats({ request, today }), (error: unknown) => error instanceof TikTokError && error.status === 409, "sin conectar responde 409, que el sync trata como omitido");

await completeAuthorization("codigo", verifier, { request, now });
const exchange = new URLSearchParams(calls[0].body);
assert.equal(exchange.get("grant_type"), "authorization_code");
assert.equal(exchange.get("code_verifier"), verifier, "envía el verificador PKCE");
assert.equal(exchange.get("redirect_uri"), "http://localhost:3000/api/tiktok/callback", "el redirect coincide con el de la autorización");

const [snapshot] = await fetchTikTokStats({ request, today });
assert.equal(calls.at(-1)?.auth, "Bearer act.uno", "usa el token guardado");
assert.deepEqual(snapshot.metrics, { followerCount: 1200, followingCount: 80, likesCount: 45000, videoCount: 37 }, "mapea los cuatro contadores");
assert.equal(snapshot.propertyId, "abc-123", "la propiedad es el open_id");
assert.equal(snapshot.date, "2026-09-19", "una fila por día");

// Token caducado: refresca con el refresh_token y usa el nuevo.
const [refreshed] = await fetchTikTokStats({ request, today: new Date(now + 2 * 86_400_000) });
assert.equal(new URLSearchParams(calls.find((call) => call.body?.includes("refresh_token"))?.body).get("refresh_token"), "rft.uno", "refresca con el refresh_token guardado");
assert.equal(calls.at(-1)?.auth, "Bearer act.nuevo", "usa el token refrescado");
assert.equal(refreshed.date, "2026-09-21");

// Sin el permiso de estadísticas TikTok solo devuelve el open_id: debe avisar, no guardar ceros.
const sinPermiso: typeof fetch = async (input, init) => String(input).includes("/oauth/token/") ? request(input, init) : new Response(JSON.stringify({ data: { user: { open_id: "abc-123" } }, error: { code: "ok" } }));
await assert.rejects(() => fetchTikTokStats({ request: sinPermiso, today }), /permiso de estadísticas/, "explica que falta el scope");

// Un error de TikTok no se confunde con un éxito vacío.
const caido: typeof fetch = async () => new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "token inválido" } }), { status: 401 });
await assert.rejects(() => fetchTikTokStats({ request: caido, today }), /token inválido/, "propaga el mensaje de TikTok");

// El token de arriba es de antes de ampliar permisos: lo nuevo pide reconectar en vez de fallar raro.
await assert.rejects(() => fetchTikTokVideos({ request, today }), (error: unknown) => error instanceof TikTokError && error.status === 403 && /Reconectar TikTok/.test(error.message), "sin video.list explica que hay que reconectar");
await assert.rejects(() => uploadVideoDraft("no-importa.mp4", { request, now }), /envío de videos/, "sin video.upload no intenta subir");

// Reparto en trozos que exige TikTok.
const MB = 1024 * 1024;
assert.deepEqual(chunkPlan(3 * MB), { chunkSize: 3 * MB, totalChunks: 1 }, "menos de 5 MB va entero");
assert.deepEqual(chunkPlan(64 * MB), { chunkSize: 64 * MB, totalChunks: 1 }, "hasta 64 MB va entero");
assert.deepEqual(chunkPlan(100 * MB), { chunkSize: 32 * MB, totalChunks: 3 }, "más de 64 MB se trocea y el último absorbe el resto");
for (const size of [64 * MB + 1, 95 * MB, 96 * MB, 1000 * MB + 7]) {
  const { chunkSize, totalChunks } = chunkPlan(size);
  const last = size - (totalChunks - 1) * chunkSize;
  assert.ok(chunkSize >= 5 * MB && chunkSize <= 64 * MB && last >= chunkSize && last <= 128 * MB, `trozos válidos para ${size} bytes`);
}

// Con los permisos nuevos: perfil, videos paginados y subida a borradores.
const completo = "user.info.basic,user.info.profile,user.info.stats,video.list,video.upload";
const video = (id: string, views: number) => ({ id, title: `Video ${id}`, create_time: 1789000000, share_url: `https://www.tiktok.com/@zen/video/${id}`, duration: 30, view_count: views, like_count: 10, comment_count: 2, share_count: 1 });
const puts: { range?: string; bytes: number }[] = [];
const nuevo: typeof fetch = async (input, init) => {
  const target = String(input);
  calls.push({ url: target, body: typeof init?.body === "string" ? init.body : undefined });
  if (target.includes("/oauth/token/")) return new Response(JSON.stringify({ ...tokenBody("act.full", "rft.full"), scope: completo }));
  if (target.includes("/video/list/")) {
    const first = !JSON.parse(String(init?.body)).cursor;
    return new Response(JSON.stringify({ data: first ? { videos: [video("1", 100), video("2", 50)], cursor: 111, has_more: true } : { videos: [video("3", 7), { title: "sin id" }], has_more: false }, error: { code: "ok" } }));
  }
  if (target.includes("/inbox/video/init/")) return new Response(JSON.stringify({ data: { publish_id: "v_inbox_file~v2.1", upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=1" }, error: { code: "ok" } }));
  if (target.includes("open-upload")) { puts.push({ range: (init?.headers as Record<string, string>)["Content-Range"], bytes: (init?.body as Uint8Array).byteLength }); return new Response(null, { status: 201 }); }
  if (target.includes("/status/fetch/")) return new Response(JSON.stringify({ data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } }));
  return new Response(JSON.stringify({ data: { user: { open_id: "abc-123", follower_count: 1200, display_name: "Zen", username: "zenlorlabs", bio_description: "", is_verified: true } }, error: { code: "ok" } }));
};
await completeAuthorization("codigo-2", verifier, { request: nuevo, now });

const [cuenta] = await fetchTikTokStats({ request: nuevo, today });
assert.match(calls.at(-1)?.url ?? "", /username/, "con user.info.profile pide los campos de perfil");
assert.deepEqual(cuenta.meta, { displayName: "Zen", username: "zenlorlabs", verified: "true" }, "guarda el perfil sin campos vacíos");

const videos = await fetchTikTokVideos({ request: nuevo, today });
assert.deepEqual(videos.map((row) => row.dimensionValue), ["1", "2", "3"], "recorre las páginas y descarta videos sin id");
assert.equal(JSON.parse(calls.at(-1)?.body ?? "{}").cursor, 111, "la segunda página usa el cursor de la primera");
assert.deepEqual(videos[0].metrics, { viewCount: 100, likeCount: 10, commentCount: 2, shareCount: 1, duration: 30 }, "mapea los contadores del video");
assert.deepEqual(videos[0].meta, { title: "Video 1", url: "https://www.tiktok.com/@zen/video/1", publishedAt: "2026-09-10" }, "guarda título, enlace y fecha de publicación");
assert.deepEqual(sumVideoMetrics(videos), { videoViews: 157, videoComments: 6, videoShares: 3 }, "suma los totales de la cuenta");

const folder = await mkdtemp(join(tmpdir(), "tiktok-"));
const file = join(folder, "render.mp4");
await writeFile(file, Buffer.alloc(1234, 7));
assert.equal(await uploadVideoDraft(file, { request: nuevo, now }), "v_inbox_file~v2.1", "devuelve el identificador del envío");
assert.deepEqual(JSON.parse(calls.find((call) => call.url.includes("/inbox/video/init/"))?.body ?? "{}"), { source_info: { source: "FILE_UPLOAD", video_size: 1234, chunk_size: 1234, total_chunk_count: 1 } }, "declara el tamaño real del archivo");
assert.deepEqual(puts, [{ range: "bytes 0-1233/1234", bytes: 1234 }], "sube el archivo entero con su rango");
assert.deepEqual(await fetchDraftStatus("v_inbox_file~v2.1", { request: nuevo, now }), { status: "SEND_TO_USER_INBOX", failReason: "" });

const lleno: typeof fetch = async (input, init) => String(input).includes("/inbox/video/init/") ? new Response(JSON.stringify({ error: { code: "spam_risk_too_many_pending_share", message: "x" } }), { status: 403 }) : nuevo(input, init);
await assert.rejects(() => uploadVideoDraft(file, { request: lleno, now }), /5 videos/, "explica el tope de borradores pendientes");
await rm(folder, { recursive: true });

await testDb.drop();
console.log("tiktok ok");
