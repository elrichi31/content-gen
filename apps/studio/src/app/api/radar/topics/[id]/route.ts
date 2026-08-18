import { RADAR_TOPIC_STATUSES, type RadarTopicStatus } from "@content-gen/domain/radar";
import { NextResponse } from "next/server";
import { getTopic, linkTopicToContent, RadarError, setTopicStatus, topicContentItems } from "@/lib/radar";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json({ topic: await getTopic(id), items: await topicContentItems(id) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer el tema." }, { status: error instanceof RadarError ? error.status : 500 }); }
}

/**
 * Registra que una pieza salió de este tema, y lo marca como usado.
 *
 * Es lo que permite responder «cuánto costó este tema de punta a punta» y «qué se produjo con lo
 * que trajo el radar», que es la medida de si vale lo que cuesta.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { contentItemId?: unknown; format?: unknown } | null;
  if (typeof body?.contentItemId !== "string" || typeof body?.format !== "string") {
    return NextResponse.json({ error: "Hacen falta contentItemId y format." }, { status: 400 });
  }
  try {
    const link = await linkTopicToContent({ topicId: id, contentItemId: body.contentItemId, format: body.format });
    // Marcar el tema como usado es parte de ligarlo: si falla la transición —porque ya estaba
    // usado, por ejemplo— el enlace sigue siendo válido y no debe deshacerse.
    const topic = await setTopicStatus(id, "usado").catch(() => getTopic(id));
    return NextResponse.json({ link, topic }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo ligar la pieza al tema." }, { status: error instanceof RadarError ? error.status : 500 });
  }
}

/**
 * Cambia el estado del tema. Es lo único que se puede modificar: el contenido de un tema es el
 * registro de lo que se encontró aquel día, y editarlo lo convertiría en otra cosa.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  const status = body?.status;
  if (typeof status !== "string" || !RADAR_TOPIC_STATUSES.includes(status as RadarTopicStatus)) {
    return NextResponse.json({ error: `El estado debe ser uno de: ${RADAR_TOPIC_STATUSES.join(", ")}.` }, { status: 400 });
  }
  try { return NextResponse.json({ topic: await setTopicStatus(id, status as RadarTopicStatus) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el tema." }, { status: error instanceof RadarError ? error.status : 500 }); }
}
