import { NextResponse } from "next/server";
import { costReport, CostReportError, currentMonth } from "@/lib/generation-costs";
import { loadPricing, missingPrices } from "@/lib/pricing";

/**
 * Gasto en IA del mes. El periodo lo fija la petición: un total sobre «los últimos N registros»
 * no significa nada cuando lo que se compara es contra un presupuesto mensual.
 */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? currentMonth();
  try {
    const report = await costReport({ month });
    return NextResponse.json({ ...report, pricing: pricingStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer el gasto." }, { status: error instanceof CostReportError ? error.status : 500 });
  }
}

/**
 * Sin esto, un importe bajo se lee como «gasté poco» cuando puede significar «falta la tarifa».
 * La pantalla necesita distinguir las dos cosas.
 */
function pricingStatus() {
  try {
    const pricing = loadPricing();
    const missing = missingPrices(pricing);
    return { version: pricing.version, currency: pricing.currency, status: missing.length ? "incomplete" : "configured", missing };
  } catch (error) {
    return { version: null, currency: "USD", status: "error", missing: [] as string[], error: error instanceof Error ? error.message : "Tarifa ilegible." };
  }
}
