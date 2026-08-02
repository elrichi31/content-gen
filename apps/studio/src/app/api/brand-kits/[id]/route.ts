import { brandKitSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../../lib/db";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const current = await withDatabase((database) => database.prepare("SELECT data_json FROM brand_kits WHERE id = ?").get(id) as { data_json: string } | undefined);
  if (!current) return NextResponse.json({ error: "Marca no encontrada." }, { status: 404 });
  const now = new Date().toISOString(); const existing = JSON.parse(current.data_json);
  const parsed = brandKitSchema.safeParse({ ...existing, ...input, id, updatedAt: now });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.archivedAt && !existing.archivedAt && await withDatabase((database) => database.prepare("SELECT id FROM campaigns WHERE brand_kit_id = ? AND archived_at IS NULL LIMIT 1").get(id))) return NextResponse.json({ error: "Archiva o desvincula primero las campañas activas de esta marca." }, { status: 409 });
  await withDatabase((database) => database.prepare("UPDATE brand_kits SET data_json = ?, updated_at = ?, archived_at = ? WHERE id = ?").run(JSON.stringify(parsed.data), now, parsed.data.archivedAt, id));
  return NextResponse.json(parsed.data);
}
