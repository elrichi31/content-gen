import { randomUUID } from "node:crypto";
import { campaignSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../lib/db";

export async function GET() {
  const campaigns = await withDatabase(async (database) => (await database.prepare("SELECT data_json FROM campaigns WHERE archived_at IS NULL ORDER BY updated_at DESC").all() as { data_json: string }[]).map((row) => JSON.parse(row.data_json)));
  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const parsed = campaignSchema.safeParse({ ...input, id: randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, archivedAt: null });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.brandKitId) {
    const brand = await withDatabase((database) => database.prepare("SELECT id FROM brand_kits WHERE id = ? AND archived_at IS NULL").get(parsed.data.brandKitId));
    if (!brand) return NextResponse.json({ error: "La marca seleccionada no existe o está archivada." }, { status: 400 });
  }
  await withDatabase((database) => database.prepare("INSERT INTO campaigns (id, schema_version, brand_kit_id, data_json, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(parsed.data.id, 1, parsed.data.brandKitId, JSON.stringify(parsed.data), now, now, null));
  return NextResponse.json(parsed.data, { status: 201 });
}
