import { randomUUID } from "node:crypto";
import { campaignSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../../../lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const input = await request.json().catch(() => ({})) as { name?: unknown; keepBrand?: unknown };
  if (input.name !== undefined && typeof input.name !== "string" || input.keepBrand !== undefined && typeof input.keepBrand !== "boolean") return NextResponse.json({ error: "Opciones de duplicado inválidas." }, { status: 400 });
  const current = await withDatabase((database) => database.prepare("SELECT data_json FROM campaigns WHERE id = ? AND archived_at IS NULL").get(id) as { data_json: string } | undefined);
  if (!current) return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  const source = campaignSchema.parse(JSON.parse(current.data_json)); const now = new Date().toISOString();
  const duplicate = campaignSchema.parse({ ...source, id: randomUUID(), name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : `${source.name} (copia)`, brandKitId: input.keepBrand === false ? null : source.brandKitId, createdAt: now, updatedAt: now, archivedAt: null });
  await withDatabase((database) => database.prepare("INSERT INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at, archived_at) VALUES (?, 1, ?, ?, ?, ?, NULL)").run(duplicate.id, duplicate.brandKitId, JSON.stringify(duplicate), now, now));
  return NextResponse.json(duplicate, { status: 201 });
}
