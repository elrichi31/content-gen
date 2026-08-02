export type CampaignPieceStatus = "draft" | "ready" | "rendering" | "exported";

export function campaignPieceStatus({ revision, hasExport, renderStatus }: { revision: number; hasExport: boolean; renderStatus?: string | null }): CampaignPieceStatus {
  if (renderStatus === "queued" || renderStatus === "processing") return "rendering";
  if (hasExport || renderStatus === "completed") return "exported";
  return revision > 0 ? "ready" : "draft";
}
