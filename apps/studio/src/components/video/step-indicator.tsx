"use client";

import { Check } from "lucide-react";

// Mismos cinco pasos del asistente de `video-autom`.
export const WIZARD_STEPS = ["Tema", "Guión", "Imágenes", "Voz", "Guardar"] as const;
export type WizardStep = 1 | 2 | 3 | 4 | 5;

export function StepIndicator({ current, onSelect, reached }: { current: WizardStep; onSelect: (step: WizardStep) => void; reached: WizardStep }) {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-2">
      {WIZARD_STEPS.map((label, index) => {
        const step = (index + 1) as WizardStep;
        const done = current > step;
        const active = current === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              disabled={step > reached}
              onClick={() => onSelect(step)}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="h-3.5 w-3.5" /> : step}
              </span>
              <span className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
            </button>
            {step < WIZARD_STEPS.length ? <span className="mx-1 h-px w-8 bg-border" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
