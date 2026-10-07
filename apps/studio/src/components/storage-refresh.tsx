"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StorageRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className="size-4" aria-hidden="true" />
      {pending ? "Actualizando…" : "Actualizar"}
    </Button>
  );
}
