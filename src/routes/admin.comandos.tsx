import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Gavel,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Vote,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PROCESS_NAME = "bot_seviicolecionaveis";
const STORAGE_KEY = "sevii.painel.grupo_selecionado";

export const Route = createFileRoute("/admin/comandos")({
  head: () => ({
    meta: [
      { title: "Comandos & Enquetes — Sevii Admin" },
      {
        name: "description",
        content:
          "Envie comandos, gerencie leilões e dispare enquetes interativas nos grupos de WhatsApp da Sevii.",
      },
      { property: "og:title", content: "Comandos & Enquetes — Sevii Admin" },
      {
        property: "og:description",
        content: "Painel de controle dos grupos de WhatsApp da Sevii Colecionáveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComandosPage,
});

type Group = { group_jid: string; group_name: string | null; status: string };
type QueueRow = {
  id: string;
  command: string;
  target_group: string | null;
  status: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  sending: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  done: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function ComandosPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [sending, setSending] = useState(false);

  // enquete personalizada
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  // enquete rápida
  const [quickTitle, setQuickTitle] = useState("");
  // enquete de compra
  const [buyItem, setBuyItem] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  // enquete quantidade
  const [qtyDesc, setQtyDesc] = useState("");
  const [qtyQty, setQtyQty] = useState("1");
  const [qtyValues, setQtyValues] = useState<string[]>(["", ""]);
  // comando livre
  const [freeCommand, setFreeCommand] = useState("");
  // modais
  const [modal, setModal] = useState<null | "all" | "sorteio" | "bv">(null);
  const [modalValue, setModalValue] = useState("");

  const groupName = useMemo(
    () => groups.find((g) => g.group_jid === selected)?.group_name ?? selected,
    [groups, selected],
  );

  const loadQueue = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("bot_command_queue")
      .select("id, command, target_group, status, created_at")
      .eq("target_bot", PROCESS_NAME)
      .order("created_at", { ascending: false })
      .limit(10);
    setQueue(data ?? []);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("bot_groups")
        .select("group_jid, group_name, status")
        .eq("status", "active")
        .order("group_name", { ascending: true });
      const list: Group[] = data ?? [];
      setGroups(list);
      const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (saved && list.some((g) => g.group_jid === saved)) setSelected(saved);
      else if (list.length === 1) setSelected(list[0].group_jid);
    })();
    loadQueue();
    const timer = setInterval(loadQueue, 5000);
    return () => clearInterval(timer);
  }, [isAdmin, loadQueue]);

  function pickGroup(jid: string) {
    setSelected(jid);
    try {
      localStorage.setItem(STORAGE_KEY, jid);
    } catch {
      /* ignore */
    }
  }

  async function enqueue(command: string, mensagem = "") {
    if (!selected) {
      toast.error("Selecione um grupo primeiro");
      return;
    }
    setSending(true);
    const { error } = await (supabase as any).from("bot_command_queue").insert({
      command,
      target_group: selected,
      target_bot: PROCESS_NAME,
      args: { mensagem, process_name: PROCESS_NAME },
      status: "pending",
    });
    setSending(false);
    if (error) {
      toast.error(`Falha ao enfileirar: ${error.message}`);
      return;
    }
    toast.success(`Comando enviado para ${groupName}`);
    loadQueue();
  }

  const disabled = !selected || sending;

  if (authLoading) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  if (!isAdmin) return <div className="p-8">Acesso restrito a administradores.</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Painel de Controle — Grupos & Enquetes</h1>
        <p className="text-sm text-muted-foreground">
          Envie comandos, gerencie leilões e dispare enquetes interativas nos grupos do WhatsApp.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Grupo de trabalho</CardTitle>
          <CardDescription>
            {groups.length === 0
              ? "Nenhum grupo ativo. Ative um grupo em Conectar Bot."
              : "A escolha fica salva neste navegador."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selected} onValueChange={pickGroup}>
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder="Selecione um grupo" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.group_jid} value={g.group_jid}>
                  {g.group_name || "Sem nome"} — {g.group_jid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!selected && (
            <p className="mt-2 text-xs text-amber-600">Selecione um grupo primeiro</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Vote className="h-4 w-4" /> Enquetes interativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="custom">
            <TabsList className="flex-wrap">
              <TabsTrigger value="custom">Personalizada</TabsTrigger>
              <TabsTrigger value="quick">Rápida</TabsTrigger>
              <TabsTrigger value="buy">Compra / Preço fixo</TabsTrigger>
              <TabsTrigger value="qty">Quantidade múltipla</TabsTrigger>
            </TabsList>

            <TabsContent value="custom" className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Pergunta / título da enquete</Label>
                <Input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Qual o melhor dia para o próximo evento?"
                />
              </div>
              <div className="space-y-2">
                <Label>Opções de voto (2 a 12)</Label>
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((prev) =>
                          prev.map((p, idx) => (idx === i ? e.target.value : p)),
                        )
                      }
                      placeholder={`Opção ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pollOptions.length <= 2}
                      onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pollOptions.length >= 12}
                  onClick={() => setPollOptions((prev) => [...prev, ""])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar opção
                </Button>
              </div>
              <Button
                disabled={disabled}
                onClick={() => {
                  const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
                  if (!pollQuestion.trim() || opts.length < 2) {
                    toast.error("Informe a pergunta e ao menos 2 opções");
                    return;
                  }
                  enqueue(`!enquete ${pollQuestion.trim()} | ${opts.join(" | ")}`);
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Disparar enquete
              </Button>
            </TabsContent>

            <TabsContent value="quick" className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Título / proposta</Label>
                <Input
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Quem quer que abra mais uma Booster Box agora?"
                />
              </div>
              <Button
                disabled={disabled}
                onClick={() => {
                  if (!quickTitle.trim()) return toast.error("Informe o título");
                  enqueue(`!enquete-s ${quickTitle.trim()}`);
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Enviar enquete rápida
              </Button>
            </TabsContent>

            <TabsContent value="buy" className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nome do item / carta</Label>
                  <Input
                    value={buyItem}
                    onChange={(e) => setBuyItem(e.target.value)}
                    placeholder="Charizard ex Shiny OBF #223"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor fixo</Label>
                  <Input
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="R$ 180,00"
                  />
                </div>
              </div>
              <Button
                disabled={disabled}
                onClick={() => {
                  if (!buyItem.trim() || !buyPrice.trim())
                    return toast.error("Informe item e valor");
                  enqueue(`!enquete-c ${buyItem.trim()} | ${buyPrice.trim()}`);
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Publicar venda fixa
              </Button>
            </TabsContent>

            <TabsContent value="qty" className="space-y-3 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Input
                    value={qtyDesc}
                    onChange={(e) => setQtyDesc(e.target.value)}
                    placeholder="Blister Triplo Escarlate e Violeta"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantidade de unidades</Label>
                  <Input
                    type="number"
                    min={1}
                    value={qtyQty}
                    onChange={(e) => setQtyQty(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valores / lances</Label>
                {qtyValues.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={v}
                      onChange={(e) =>
                        setQtyValues((prev) =>
                          prev.map((p, idx) => (idx === i ? e.target.value : p)),
                        )
                      }
                      placeholder={`R$ ${45 + i * 5}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={qtyValues.length <= 2}
                      onClick={() => setQtyValues((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={qtyValues.length >= 12}
                  onClick={() => setQtyValues((prev) => [...prev, ""])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar valor
                </Button>
              </div>
              <Button
                disabled={disabled}
                onClick={() => {
                  const vals = qtyValues.map((v) => v.trim()).filter(Boolean);
                  if (!qtyDesc.trim() || vals.length < 2)
                    return toast.error("Informe descrição e ao menos 2 valores");
                  enqueue(
                    `!enquete-q ${qtyDesc.trim()} | ${Number(qtyQty) || 1} | ${vals.join(" | ")}`,
                  );
                }}
              >
                <Send className="mr-2 h-4 w-4" /> Enviar enquete com quantidade
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" /> Comandos rápidos de grupo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Button variant="outline" disabled={disabled} onClick={() => { setModalValue(""); setModal("all"); }}>
            !all — Marcar todos
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => { setModalValue("3"); setModal("sorteio"); }}>
            !sorteio-membros
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => { setModalValue(""); setModal("bv"); }}>
            !criar-bv
          </Button>
          {["!ping", "!abrir", "!fechar", "!quiz", "!ranking", "!parar-jogo"].map((c) => (
            <Button key={c} variant="outline" disabled={disabled} onClick={() => enqueue(c)}>
              {c}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4" /> Gestão de leilão (pregão)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["!iniciar-leilao", "!status-leilao", "!encerrar-leilao", "!liberar-leilao"].map((c) => (
            <Button key={c} variant="outline" disabled={disabled} onClick={() => enqueue(c)}>
              {c}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Comando livre / mensagem direta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={3}
            value={freeCommand}
            onChange={(e) => setFreeCommand(e.target.value)}
            placeholder="!ajuda ou Aviso importante: envio dos pedidos amanhã às 14h"
          />
          <Button
            disabled={disabled}
            onClick={() => {
              if (!freeCommand.trim()) return toast.error("Digite o comando ou mensagem");
              enqueue(freeCommand.trim());
              setFreeCommand("");
            }}
          >
            <Send className="mr-2 h-4 w-4" /> Enviar comando / mensagem
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fila de comandos (últimos 10)</CardTitle>
          <CardDescription>Atualiza automaticamente a cada 5 segundos.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Comando</th>
                <th className="py-2">Destino</th>
                <th className="py-2">Status</th>
                <th className="py-2">Hora</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-muted-foreground">
                    Nenhum comando enviado ainda.
                  </td>
                </tr>
              )}
              {queue.map((row) => {
                const g = groups.find((x) => x.group_jid === row.target_group);
                return (
                  <tr key={row.id} className="border-t">
                    <td className="max-w-[280px] truncate py-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {row.command}
                      </Badge>
                    </td>
                    <td className="py-2">{g?.group_name || row.target_group || "—"}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                          STATUS_STYLES[row.status] ?? "border-border text-muted-foreground"
                        }`}
                      >
                        {row.status === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 tabular-nums">
                      {new Date(row.created_at).toLocaleTimeString("pt-BR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={modal !== null} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal === "all"
                ? "Marcar todos (!all)"
                : modal === "sorteio"
                  ? "Sorteio entre membros"
                  : "Mensagem de boas-vindas"}
            </DialogTitle>
            <DialogDescription>
              {modal === "sorteio"
                ? "Informe o número de ganhadores."
                : "Informe o texto que será enviado ao grupo."}
            </DialogDescription>
          </DialogHeader>
          {modal === "sorteio" ? (
            <Input
              type="number"
              min={1}
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
            />
          ) : (
            <Textarea
              rows={3}
              value={modalValue}
              onChange={(e) => setModalValue(e.target.value)}
              placeholder={
                modal === "all"
                  ? "Atenção membros, leilão iniciando em 5 minutos!"
                  : "Bem-vindo(a) ao grupo da Sevii Colecionáveis!"
              }
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                const v = modalValue.trim();
                if (!v) return toast.error("Preencha o campo");
                if (modal === "all") enqueue(`!all ${v}`, v);
                else if (modal === "sorteio") enqueue(`!sorteio-membros ${Number(v) || 1}`);
                else enqueue(`!criar-bv ${v}`, v);
                setModal(null);
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
