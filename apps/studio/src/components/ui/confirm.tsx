"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type ConfirmOptions = { title: string; description: string; action: string; destructive?: boolean }
type Pending = ConfirmOptions & { resolve: (confirmed: boolean) => void }

// Igual que el toast de sonner: una función suelta que habla con el host montado en el layout.
let show: ((pending: Pending) => void) | null = null

/** Sustituto de `window.confirm` con el modal del estudio. Sin `<ConfirmHost />` montado responde que no. */
export function confirmDialog(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => show ? show({ ...options, resolve }) : resolve(false))
}

export function ConfirmHost() {
  // La pregunta se guarda aparte del abierto/cerrado para que el texto no se vacíe durante la animación de cierre.
  const [pending, setPending] = useState<Pending | null>(null)
  const [open, setOpen] = useState(false)
  const current = useRef<Pending | null>(null)

  useEffect(() => {
    show = (next) => {
      // Una pregunta nueva sobre otra abierta: la anterior queda respondida que no.
      current.current?.resolve(false)
      current.current = next
      setPending(next)
      setOpen(true)
    }
    return () => { show = null; current.current?.resolve(false) }
  }, [])

  function settle(confirmed: boolean) {
    current.current?.resolve(confirmed)
    current.current = null
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>{pending?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => settle(true)}>{pending?.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
