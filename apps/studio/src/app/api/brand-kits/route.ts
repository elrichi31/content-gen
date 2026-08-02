import { randomUUID } from "node:crypto";
import { brandKitSchema } from "@content-gen/domain/schemas";
import { NextResponse } from "next/server";
import { withDatabase } from "../../../lib/db";

export async function GET() {
  const brands = await withDatabase((database) => (database.prepare("SELECT data_json FROM brand_kits WHERE archived_at IS NULL ORDER BY updated_at DESC").all() as { data_json: string }[]).map((row) => JSON.parse(row.data_json)));
  return NextResponse.json(brands);
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  const now = new Date().toISOString();
  const parsed = brandKitSchema.safeParse({ ...input, id: randomUUID(), schemaVersion: 1, createdAt: now, updatedAt: now, archivedAt: null });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  await withDatabase((database) => database.prepare("INSERT INTO brand_kits (id, schema_version, data_json, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?)").run(parsed.data.id, 1, JSON.stringify(parsed.data), now, now, null));
  return NextResponse.json(parsed.data, { status: 201 });
}
