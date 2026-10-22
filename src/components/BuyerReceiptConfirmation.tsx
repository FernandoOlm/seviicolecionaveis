import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmBuyerReceipt } from '@/lib/buyer-receipt.functions'

export function BuyerReceiptConfirmation({ orderId, onConfirmed }: { orderId: string; onConfirmed: (receipt: { status: string; buyer_received_at: string; buyer_received_by: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const confirmReceipt = useServerFn(confirmBuyerReceipt)
  const cancelRef = useRef<HTMLButtonElement>(null)
  async function submit() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      const receipt = await confirmReceipt({ data: { orderId } })
      onConfirmed(receipt)
      setOpen(false)
      toast.success('Pedido marcado como entregue. Obrigado!')
      if (!receipt.storeNotified) toast.info('Seu recebimento foi registrado, mas não conseguimos enviar o aviso por e-mail à loja agora.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível confirmar o recebimento. Tente novamente.')
    } finally { submitting.current = false; setBusy(false) }
  }
  return <>
    <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(true)}>Marcar como Entregue</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md rounded-lg" onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus() }}>
        <DialogHeader><DialogTitle>Confirmar entrega</DialogTitle><DialogDescription className="pt-2 leading-relaxed">Tem certeza que deseja alterar o status do pedido para Entregue? Confirme apenas se você já está com todas as suas cartas em mãos.</DialogDescription></DialogHeader>
        <DialogFooter className="gap-2">
          <Button ref={cancelRef} variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? 'Confirmando...' : 'Sim, recebi meu pedido'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}