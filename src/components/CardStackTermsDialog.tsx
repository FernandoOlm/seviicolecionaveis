import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function CardStackTermsDialog({ open, onAccept, onCancel }: Props) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">🃏 Pilha de Cartas</DialogTitle>
          <DialogDescription>
            Leia com atenção antes de prosseguir com esta modalidade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground">
          <p>
            A Pilha de Cartas foi criada para ajudar você a economizar nos custos de envio,
            permitindo acumular suas compras e solicitar tudo de uma só vez.
          </p>

          <div>
            <h3 className="font-semibold mb-1">Regras da Pilha de Cartas</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>O prazo de armazenamento é de <strong>30 dias</strong> a partir da primeira compra enviada para a pilha.</li>
              <li>Durante esse período, você pode continuar adicionando novas cartas à sua pilha.</li>
              <li>Ao final do prazo, você será notificado por e-mail para que possa escolher o envio ou retirada.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Opções de retirada e envio</h3>
            <p className="mb-2">
              Quando desejar receber suas cartas, você poderá escolher uma das seguintes opções:
            </p>

            <div className="space-y-3">
              <div className="rounded-md border border-border p-3">
                <p className="font-semibold">📦 Correios</p>
                <p className="text-muted-foreground text-xs mt-1">
                  O site realizará a cotação automaticamente. O valor do frete será calculado e
                  cobrado no momento da solicitação.
                </p>
              </div>

              <div className="rounded-md border border-border p-3">
                <p className="font-semibold">🛵 Aplicativo de Entrega</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Será disponibilizado um botão para contato via WhatsApp. Nossa equipe realizará a
                  cotação e combinará o envio com você.
                </p>
              </div>

              <div className="rounded-md border border-border p-3">
                <p className="font-semibold">🏪 Retirada Presencial</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Retirada gratuita em um de nossos pontos:
                </p>
                <ul className="list-disc pl-5 mt-1 text-xs text-muted-foreground">
                  <li>Aruana</li>
                  <li>Aeroporto</li>
                </ul>
              </div>

              <div className="rounded-md border border-border p-3">
                <p className="font-semibold">🎪 Retirada em Eventos</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Gratuita. Retire suas cartas no evento que você vai comparecer — basta informar
                  qual evento ao solicitar a retirada.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Acompanhe sua pilha a qualquer momento através da sua área de cliente.
          </p>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t bg-background px-6 py-4 space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => setChecked(c === true)}
              className="mt-0.5"
            />
            <span className="text-sm">
              Li e aceito as regras da Pilha de Cartas.
            </span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" disabled={!checked} onClick={onAccept}>
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
