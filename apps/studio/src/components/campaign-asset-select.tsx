"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Asset = { id: string; filename: string };
const NONE = "none";

export function CampaignAssetSelect({ campaignId, value, onChange }: { campaignId?: string; value?: string | null; onChange: (id: string | null) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  useEffect(() => {
    if (!campaignId) { setAssets([]); return; }
    void fetch(`/api/assets?campaignId=${encodeURIComponent(campaignId)}&kind=image`).then((response) => response.json()).then(setAssets);
  }, [campaignId]);

  if (!campaignId || !assets.length) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Biblioteca de campaña</Label>
      <Select value={value ?? NONE} onValueChange={(id) => onChange(id === NONE ? null : id)}>
        <SelectTrigger aria-label="Biblioteca de campaña" className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin imagen</SelectItem>
          {assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
