import { randomUUID } from "node:crypto";
import { contentItemSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../../../lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const now = new Date().toISOString();
  const current = await withDatabase(async (database) => await database.prepare("SELECT document_json FROM content_items WHERE id = ? AND archived_at IS NULL").get(id) as { document_json: string } | undefined);
  if (!current) return NextResponse.json({ error: "Contenido no encontrado." }, { status: 404 });
  const parsed = contentItemSchema.safeParse({ ...JSON.parse(current.document_json), id: randomUUID(), revision: 0, createdAt: now, updatedAt: now, archivedAt: null });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await withDatabase((database) => database.prepare("INSERT INTO content_items (id, schema_version, campaign_id, type, document_json, revision, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(parsed.data.id, 1, parsed.data.campaignId, parsed.data.type, JSON.stringify(parsed.data), 0, now, now, null));
  return NextResponse.json(parsed.data, { status: 201 });
}
