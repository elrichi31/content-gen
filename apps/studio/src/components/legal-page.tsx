import type { ReactNode } from "react";

/**
 * Página pública (sin login ni sidebar). TikTok exige unos Terms y una Privacy visibles en el
 * sitio de la app para revisarla, y las lee quien no tiene cuenta del equipo.
 */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const contact = process.env.LEGAL_CONTACT_EMAIL?.trim();
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-sm leading-relaxed text-muted-foreground">
      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-wide">Content Gen</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-xs">Last updated: September 19, 2026</p>
      </header>
      {children}
      <LegalSection title="Contact">
        {contact
          ? <>Questions or requests about this page or your data: <a className="text-primary underline underline-offset-4" href={`mailto:${contact}`}>{contact}</a>.</>
          : "Contact the administrator who gave you access to Content Gen."}
      </LegalSection>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
