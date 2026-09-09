import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, ArrowUp, ArrowDown, Upload, ArrowLeft, Download, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/admin/criar-leilao")({
  head: () => ({ meta: [{ title: "Criar Leilão — Admin" }] }),
  validateSearch: (s: { id?: string }): { id?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: CreateAuctionPage,
});

type ItemForm = {
  id?: string;
  name: string;
  description: string;
  image_url: string;
  /** [0] = lance inicial, [1..] = incrementos (Inc. 1, Inc. 2, …) */
  values: string[];
  buyout_price: string;
  quantity: string;
};

const MAX_VALUES = 7;
const DEFAULT_VALUES = 5;

const labelForValue = (i: number) => (i === 0 ? "Inicial" : `Inc. ${i}`);

const emptyItem = (): ItemForm => ({
  name: "",
  description: "",
  image_url: "",
  values: Array.from({ length: DEFAULT_VALUES }, () => ""),
  buyout_price: "",
  quantity: "1",
});

const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function CreateAuctionPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const { id: editId } = Route.useSearch();

  const [groups, setGroups] = useState<{ group_jid: string; group_name: string | null }[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [groupJid, setGroupJid] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [closingMessage, setClosingMessage] = useState("Os links de pagamento foram enviados no privado!");
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: grp } = await (supabase as any)
      .from("bot_groups")
      .select("group_jid, group_name")
      .eq("status", "active");
    setGroups(grp ?? []);

    if (editId) {
      const [{ data: a }, { data: its }] = await Promise.all([
        (supabase as any).from("auctions").select("*").eq("id", editId).maybeSingle(),
        (supabase as any).from("auction_items").select("*").eq("auction_id", editId).order("sequence"),
      ]);
      if (a) {
        setTitle(a.title ?? "");
        setDescription(a.description ?? "");
        setGroupJid(a.group_jid ?? "");
        setStart(toLocalInput(a.scheduled_start));
        setEnd(toLocalInput(a.scheduled_end));
        setClosingMessage(a.closing_message ?? "");
      }
      if (its?.length) {
        setItems(
          its.map((i: any) => ({
            id: i.id,
            name: i.name ?? "",
            description: i.description ?? "",
            image_url: i.image_url ?? "",
            values: (() => {
              const extras = Array.isArray(i.extra_prices)
                ? i.extra_prices.map((p: any) => (p?.value != null ? String(p.value) : ""))
                : [];
              const vals = [
                i.starting_price != null ? String(i.starting_price) : "",
                i.bid_increment != null ? String(i.bid_increment) : "",
                ...extras,
              ].slice(0, MAX_VALUES);
              while (vals.length < DEFAULT_VALUES) vals.push("");
              return vals;
            })(),
            buyout_price: i.buyout_price != null ? String(i.buyout_price) : "",
            quantity: String(i.quantity ?? 1),
          })),
        );
      }
    }
    setLoading(false);
  }, [editId]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  if (authLoading || loading) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) {
    nav({ to: "/" });
    return null;
  }

  const patchItem = (idx: number, patch: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const move = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });

  const uploadImage = async (idx: number, file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `leiloes/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("card-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) return toast.error(`Erro ao enviar imagem: ${error.message}`);
    const { data } = supabase.storage.from("card-images").getPublicUrl(path);
    patchItem(idx, { image_url: data.publicUrl });
    toast.success("Imagem enviada.");
  };


  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const header = [
      "nome",
      "descricao",
      "lance_inicial",
      "inc_1",
      "inc_2",
      "inc_3",
      "inc_4",
      "inc_5",
      "inc_6",
      "arremate",
      "quantidade",
      "imagem_url",
    ];
    const example = [
      {
        nome: "Pikachu VMAX",
        descricao: "NM - Português",
        lance_inicial: 50,
        inc_1: 55,
        inc_2: 60,
        inc_3: 70,
        inc_4: "",
        inc_5: "",
        inc_6: "",
        arremate: 300,
        quantidade: 1,
        imagem_url: "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(example, { header });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lotes");
    XLSX.writeFile(wb, "modelo-lotes-leilao.xlsx");
  };

  const importSpreadsheet = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) return toast.error("Planilha vazia.");
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]!, { defval: "" });
      const norm = (v: any) => String(v ?? "").trim();
      const parsed: ItemForm[] = rows
        .map((r) => {
          const values = [norm(r["lance_inicial"])];
          for (let n = 1; n < MAX_VALUES; n++) values.push(norm(r[`inc_${n}`]));
          while (values.length > DEFAULT_VALUES && !values[values.length - 1]) values.pop();
          return {
            name: norm(r["nome"]),
            description: norm(r["descricao"]),
            image_url: norm(r["imagem_url"]),
            values,
            buyout_price: norm(r["arremate"]),
            quantity: norm(r["quantidade"]) || "1",
          } as ItemForm;
        })
        .filter((i) => i.name);
      if (parsed.length === 0) return toast.error("Nenhum lote válido encontrado (coluna 'nome' obrigatória).");
      setItems((prev) => {
        const base = prev.filter((p) => p.name.trim());
        return [...base, ...parsed];
      });
      toast.success(`${parsed.length} lote(s) importado(s).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler a planilha.");
    }
  };

  const save = async (mode: "draft" | "scheduled") => {
    if (!title.trim()) return toast.error("Informe o título do leilão.");
    if (!groupJid) return toast.error("Selecione o grupo de destino.");
    if (!start || !end) return toast.error("Informe início e término.");
    const startIso = new Date(start).toISOString();
    const endIso = new Date(end).toISOString();
    if (new Date(endIso) <= new Date(startIso)) return toast.error("O término deve ser após o início.");
    const validItems = items.filter((i) => i.name.trim());
    if (mode === "scheduled" && validItems.length === 0) return toast.error("Adicione ao menos um lote.");

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        group_jid: groupJid,
        status: mode,
        scheduled_start: startIso,
        scheduled_end: endIso,
        closing_message: closingMessage.trim() || null,
      };

      let auctionId = editId;
      if (auctionId) {
        const { error } = await (supabase as any).from("auctions").update(payload).eq("id", auctionId);
        if (error) throw error;
        await (supabase as any).from("auction_items").delete().eq("auction_id", auctionId);
        await (supabase as any).from("auction_schedules").delete().eq("auction_id", auctionId).eq("status", "pending");
      } else {
        const { data, error } = await (supabase as any).from("auctions").insert(payload).select("id").single();
        if (error) throw error;
        auctionId = data.id;
      }

      if (validItems.length > 0) {
        const num = (v: string) => Number(String(v ?? "").replace(",", "."));
        const rows = validItems.map((i, idx) => {
          const vals = i.values.map(num).map((n) => (Number.isFinite(n) ? n : 0));
          return {
            auction_id: auctionId,
            sequence: idx + 1,
            name: i.name.trim(),
            description: i.description.trim() || null,
            image_url: i.image_url || null,
            starting_price: vals[0] || 1,
            bid_increment: vals[1] || 1,
            buyout_price: i.buyout_price ? num(i.buyout_price) : null,
            quantity: Number(i.quantity) || 1,
            extra_prices: i.values
              .slice(2, MAX_VALUES)
              .map((v, k) => ({ label: labelForValue(k + 2), value: num(v) }))
              .filter((p) => Number.isFinite(p.value) && p.value > 0),
          };
        });
        const { error } = await (supabase as any).from("auction_items").insert(rows);
        if (error) throw error;
      }

      if (mode === "scheduled") {
        const { error } = await (supabase as any).from("auction_schedules").insert([
          { auction_id: auctionId, action: "START", scheduled_time: startIso, group_jid: groupJid },
          { auction_id: auctionId, action: "CLOSE", scheduled_time: endIso, group_jid: groupJid },
        ]);
        if (error) throw error;
      }

      toast.success(mode === "draft" ? "Rascunho salvo." : "Leilão programado!");
      nav({ to: "/admin/leiloes-whatsapp" });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/leiloes-whatsapp" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Leilões
        </Link>
      </div>
      <h1 className="text-xl font-black uppercase tracking-tight">{editId ? "Editar Leilão" : "Criar Leilão"}</h1>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide">Dados gerais</h2>
        <input className={input} placeholder="Título do leilão" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={input} rows={2} placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <select className={input} value={groupJid} onChange={(e) => setGroupJid(e.target.value)}>
          <option value="">Selecione o grupo de destino…</option>
          {groups.map((g) => (
            <option key={g.group_jid} value={g.group_jid}>
              {g.group_name ?? g.group_jid}
            </option>
          ))}
        </select>
        {groups.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum grupo ativo. Ative um grupo em <Link to="/admin/conectar-bot" className="underline">Conectar Bot</Link>.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold">
            Início
            <input type="datetime-local" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Término
            <input type="datetime-local" className={input} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <textarea className={input} rows={2} placeholder="Mensagem de encerramento" value={closingMessage} onChange={(e) => setClosingMessage(e.target.value)} />
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide">Lotes / Itens</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" /> Baixar modelo
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Importar planilha
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importSpreadsheet(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => setItems((p) => [...p, emptyItem()])}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Lote
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cadastro em massa: baixe o modelo, preencha uma linha por lote (colunas de valores extras opcionais) e importe. Os lotes importados são adicionados à lista.
        </p>


        {items.map((it, idx) => (
          <div key={idx} className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold">Lote {idx + 1}</p>
              <div className="flex gap-1">
                <button onClick={() => move(idx, -1)} className="rounded border border-border p-1 hover:bg-secondary"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => move(idx, 1)} className="rounded border border-border p-1 hover:bg-secondary"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button
                  onClick={() => setItems((p) => (p.length === 1 ? p : p.filter((_, i) => i !== idx)))}
                  className="rounded border border-destructive/40 p-1 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {it.image_url ? (
                <img src={it.image_url} alt={it.name} className="h-20 w-20 rounded object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted-foreground">
                  sem foto
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-secondary">
                <Upload className="h-3.5 w-3.5" /> Enviar foto
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadImage(idx, f);
                  }}
                />
              </label>
            </div>

            <input className={input} placeholder="Nome do item" value={it.name} onChange={(e) => patchItem(idx, { name: e.target.value })} />
            <input className={input} placeholder="Descrição / Condição" value={it.description} onChange={(e) => patchItem(idx, { description: e.target.value })} />
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  Valores ({it.values.length}/{MAX_VALUES})
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => patchItem(idx, { values: it.values.slice(0, Math.max(2, it.values.length - 1)) })}
                    disabled={it.values.length <= 2}
                    className="rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-secondary disabled:opacity-40"
                  >
                    − Remover
                  </button>
                  <button
                    onClick={() => patchItem(idx, { values: [...it.values, ""] })}
                    disabled={it.values.length >= MAX_VALUES}
                    className="rounded border border-primary/50 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-40"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {it.values.map((v, vi) => (
                  <input
                    key={vi}
                    className={input}
                    placeholder={labelForValue(vi)}
                    value={v}
                    onChange={(e) =>
                      patchItem(idx, { values: it.values.map((x, i2) => (i2 === vi ? e.target.value : x)) })
                    }
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-[11px] font-semibold">
                Arremate (R$)
                <input className={input} placeholder="opcional" value={it.buyout_price} onChange={(e) => patchItem(idx, { buyout_price: e.target.value })} />
              </label>
              <label className="space-y-1 text-[11px] font-semibold">
                Quantidade
                <input className={input} value={it.quantity} onChange={(e) => patchItem(idx, { quantity: e.target.value })} />
              </label>
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={saving}
          onClick={() => save("draft")}
          className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-secondary disabled:opacity-50"
        >
          Salvar Rascunho
        </button>
        <button
          disabled={saving}
          onClick={() => save("scheduled")}
          className="rounded-md bg-foreground px-4 py-2 text-xs font-bold text-background disabled:opacity-50"
        >
          Programar Leilão
        </button>
      </div>
    </div>
  );
}
