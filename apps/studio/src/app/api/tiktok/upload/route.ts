import { setTimeout as sleep } from "node:timers/promises";
import { NextResponse } from "next/server";
import { resolveAssetPath } from "@/lib/asset-file";
import { mediaRoot, withDatabase } from "@/lib/db";
import { fetchDraftStatus, TikTokError, uploadVideoDraft } from "@/lib/tiktok";

/** Envía un MP4 ya renderizado a los borradores de la cuenta de TikTok conectada. */
export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { assetId?: unknown } | null;
  if (typeof input?.assetId !== "string") return NextResponse.json({ error: "Falta el video a enviar." }, { status: 400 });
  const row = await withDatabase(async (database) => await database.prepare("SELECT data_json FROM assets WHERE id = ?").get(input.assetId) as { data_json: string } | undefined);
  if (!row) return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  const asset = JSON.parse(row.data_json) as { storageKey: string; mimeType: string };
  if (asset.mimeType !== "video/mp4") return NextResponse.json({ error: "Solo se pueden enviar videos MP4." }, { status: 400 });

  let publishId: string;
  try {
    publishId = await uploadVideoDraft(resolveAssetPath(mediaRoot, asset.storageKey));
  } catch (error) {
    return NextResponse.json({ error: error instanceof TikTokError ? error.message : "No se pudo enviar el video a TikTok." }, { status: error instanceof TikTokError ? error.status : 500 });
  }

  // TikTok procesa el video después de recibirlo: se espera un poco para poder avisar si lo rechaza.
  // ponytail: espera de 30 s dentro de la petición; pasar a consulta desde el cliente si se queda corta.
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await sleep(3000);
      const { status, failReason } = await fetchDraftStatus(publishId);
      if (status === "FAILED") return NextResponse.json({ error: `TikTok recibió el video pero no pudo procesarlo: ${failReason || "sin motivo"}.` }, { status: 502 });
      if (status === "SEND_TO_USER_INBOX" || status === "PUBLISH_COMPLETE") return NextResponse.json({ status: "inbox" });
    }
  } catch (error) {
    // El video ya está subido: un fallo al consultar el estado no debe contarse como envío fallido.
    console.error("[tiktok] no se pudo consultar el estado del envío", publishId, error);
  }
  // Sin el identificador el cliente no puede seguir el envío y un rechazo posterior pasaría en silencio.
  return NextResponse.json({ status: "processing", publishId });
}

/** Estado de un envío que seguía procesándose al responder el POST. */
export async function GET(request: Request) {
  const publishId = new URL(request.url).searchParams.get("publishId");
  if (!publishId) return NextResponse.json({ error: "Falta el envío a consultar." }, { status: 400 });
  try {
    const { status, failReason } = await fetchDraftStatus(publishId);
    if (status === "FAILED") return NextResponse.json({ status: "failed", error: `TikTok recibió el video pero no pudo procesarlo: ${failReason || "sin motivo"}.` });
    return NextResponse.json({ status: status === "SEND_TO_USER_INBOX" || status === "PUBLISH_COMPLETE" ? "inbox" : "processing" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TikTokError ? error.message : "No se pudo consultar el envío a TikTok." }, { status: error instanceof TikTokError ? error.status : 500 });
  }
}
