"use client";

import { useState } from "react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, noticeError, noticeOk, type NoticeState } from "@/components/ui/notice";
import { authClient } from "@/lib/auth-client";

function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setNotice(noticeError(error.message ?? "No se pudo cambiar la contraseña."));
    setCurrent("");
    setNext("");
    setNotice(noticeOk("Contraseña actualizada. Se cerraron las demás sesiones abiertas."));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Cambiar mi contraseña</h2>
        <p className="text-xs text-muted-foreground">Al cambiarla se cierran tus sesiones en otros dispositivos.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Contraseña actual</Label>
        <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-password">Contraseña nueva</Label>
        <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(event) => setNext(event.target.value)} />
      </div>
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Cambiar contraseña"}</Button>
    </form>
  );
}

function CreateAccountForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/team/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email, password }) });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setNotice(noticeError(typeof payload.error === "string" ? payload.error : "No se pudo crear la cuenta."));
    setNotice(noticeOk(`Cuenta creada: ${email}. Pasale la contraseña por un canal seguro.`));
    setName("");
    setEmail("");
    setPassword("");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Crear cuenta del equipo</h2>
        <p className="text-xs text-muted-foreground">No hay registro público: solo se crean cuentas desde acá.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-name">Nombre</Label>
        <Input id="new-name" required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-email">Email</Label>
        <Input id="new-email" type="email" autoComplete="off" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-account-password">Contraseña inicial</Label>
        <Input id="new-account-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      <Button type="submit" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</Button>
    </form>
  );
}

export default function AccountPage() {
  return (
    <PageShell>
      <PageHeading eyebrow="Sistema" title="Mi cuenta" description="Cambiá tu contraseña y da de alta a quien se suma al equipo." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePasswordForm />
        <CreateAccountForm />
      </div>
    </PageShell>
  );
}
