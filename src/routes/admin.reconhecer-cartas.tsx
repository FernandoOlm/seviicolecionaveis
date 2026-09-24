import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { invalidateCardsCache } from "@/hooks/useCardsCatalog";
import { recognizeCardsFromPhotos, type CardCandidate, type DetectedCard } from "@/lib/card-recognition.functions";
import { COLLECTIONS, CONDITIONS, CONDITION_LABEL, FINISHES, LANGUAGES } from "@/data/cards";
import { useCustomCollections } from "@/lib/custom-collections";
import { Camera, Check, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/reconhecer-cartas")({
  head: () => ({ meta: [{ title: "Reconhecer cartas por foto — Admin" }] }),
  component: RecognizePage,
});

interface Item extends DetectedCard {
  include: boolean;
  selectedId: string | null;
  applied: boolean;
  searching: boolean;
  creating: boolean;
  newCondition: string;
  newPrice: string;
  newCategory: string;
}

const MAX_SIDE = 1400;

async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function RecognizePage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const recognize = useServerFn(recognizeCardsFromPhotos);
  const fileRef = useRef<HTMLInputElement>(null);
  const { customCollections } = useCustomCollections();

  const [previews, setPreviews] = useState<string[]>([]);
  const uploadedRef = useRef<Map<number, string>>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!user) nav({ to: "/auth" });
      else if (!isAdmin) nav({ to: "/" });
    }
  }, [authLoading, user, isAdmin, nav]);

  const collections = useMemo(
    () => Array.from(new Set([...COLLECTIONS, ...customCollections])).sort(),
    [customCollections],
  );

  const update = (key: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  // Converte a coleção lida pela foto para uma coleção existente (ex.: "SVI" → "SVI - Escarlate e Violeta").
  const matchCollection = (raw: string): string => {
    const value = raw.trim();
    if (!value) return "";
    if (collections.includes(value)) return value;
    const lower = value.toLowerCase();
    const exactCi = collections.find((c) => c.toLowerCase() === lower);
    if (exactCi) return exactCi;
    const byCode = collections.filter((c) => c.split(" - ")[0].trim().toLowerCase() === lower);
    if (byCode.length === 1) return byCode[0];
    const byName = collections.filter((c) => {
      const parts = c.toLowerCase().split(" - ");
      return parts.slice(1).join(" - ").trim() === lower || c.toLowerCase().includes(lower);
    });
    if (byName.length === 1) return byName[0];
    return "";
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setMsg(null);
    setAnalyzing(true);
    try {
      const list = Array.from(files).slice(0, 6);
      const dataUrls = await Promise.all(list.map(fileToDataUrl));
      setPreviews(dataUrls);
      uploadedRef.current = new Map();
      const res = await recognize({ data: { images: dataUrls } });
      const mapped: Item[] = res.detections.map((d) => {
        const collection = matchCollection(d.collection ?? "");
        const rawCollection = (d.collection ?? "").trim();
        const unmatchedNote =
          rawCollection && !collection ? `Coleção lida na foto: "${rawCollection}" (não cadastrada).` : "";
        return {
          ...d,
          collection,
          notes: [d.notes, unmatchedNote].filter(Boolean).join(" "),
          include: true,
          selectedId: d.candidates[0]?.id ?? null,
          applied: false,
          searching: false,
          creating: false,
          newCondition: "",
          newPrice: "",
          newCategory: "Pokémon",
        };
      });
      setItems(mapped);
      if (!mapped.length) setMsg({ type: "err", text: "Nenhuma carta foi identificada nas fotos." });
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message || "Falha ao analisar as fotos." });
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const research = async (it: Item) => {
    update(it.key, { searching: true });
    const term = it.name.trim();
    let query = supabase
      .from("cards")
      .select("id, name, card_number, collection, language, finish, condition, stock, image")
      .limit(20);
    if (term) query = query.ilike("name", `%${term}%`);
    if (it.number.trim()) query = query.ilike("card_number", `%${it.number.trim().split("/")[0]}%`);
    if (it.collection.trim()) query = query.ilike("collection", `%${it.collection.trim()}%`);
    const { data, error } = await query;
    const candidates = ((data ?? []) as any[]).map((r) => ({ ...r, score: 0 })) as CardCandidate[];
    update(it.key, {
      searching: false,
      candidates,
      selectedId: candidates[0]?.id ?? null,
    });
    if (error) setMsg({ type: "err", text: error.message });
  };

  const uploadPreview = async (index: number): Promise<string> => {
    const cached = uploadedRef.current.get(index);
    if (cached) return cached;
    const dataUrl = previews[index];
    if (!dataUrl) return "";
    const blob = await (await fetch(dataUrl)).blob();
    const path = `cards/reconhecimento/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("card-images")
      .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`);
    const url = supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl;
    uploadedRef.current.set(index, url);
    return url;
  };

  const createCard = async (it: Item) => {
    if (!it.collection.trim() || !collections.includes(it.collection)) {
      setMsg({ type: "err", text: "Selecione a coleção da carta antes de continuar." });
      return;
    }
    if (!it.newCondition) {
      setMsg({ type: "err", text: "Selecione a condição da carta antes de continuar." });
      return;
    }
    update(it.key, { creating: true });
    let image = "";
    try {
      image = await uploadPreview(it.imageIndex);
    } catch (e: any) {
      update(it.key, { creating: false });
      setMsg({ type: "err", text: e?.message || "Falha ao enviar a foto." });
      return;
    }
    const payload = {
      name: it.name.trim(),
      card_number: it.number.trim(),
      collection: it.collection.trim(),
      language: it.language,
      finish: it.finish,
      condition: it.newCondition,
      category: it.newCategory,
      stock: 0,
      base_price_cents: it.newPrice ? Math.round(parseFloat(it.newPrice.replace(",", ".")) * 100) : null,
      image,
      created_by: user?.id ?? null,
    };
    const { data, error } = await supabase.from("cards").insert(payload as any).select("id, name, card_number, collection, language, finish, condition, stock, image").single();
    update(it.key, { creating: false });
    if (error || !data) {
      setMsg({ type: "err", text: error?.message || "Não foi possível cadastrar a carta." });
      return;
    }
    const candidate = { ...(data as any), score: 100 } as CardCandidate;
    update(it.key, { candidates: [candidate, ...it.candidates], selectedId: candidate.id });
    setMsg({ type: "ok", text: `Carta "${candidate.name}" cadastrada. Agora é só validar o estoque.` });
  };

  const applyStock = async () => {
    const payload = items
      .filter((it) => it.include && !it.applied && it.selectedId)
      .map((it) => ({ card_id: it.selectedId, quantity: it.quantity }));
    if (!payload.length) {
      setMsg({ type: "err", text: "Nenhuma carta pronta para subir estoque." });
      return;
    }
    setApplying(true);
    const { data, error } = await supabase.rpc("apply_recognized_stock", {
      _items: payload as any,
      _reason: "Reconhecimento por foto",
    });
    setApplying(false);
    if (error) {
      setMsg({ type: "err", text: error.message });
      return;
    }
    invalidateCardsCache();
    setItems((prev) => prev.map((it) => (it.include && it.selectedId ? { ...it, applied: true } : it)));
    setMsg({ type: "ok", text: `${data ?? 0} unidade(s) adicionada(s) ao estoque.` });
  };

  const pending = items.filter((it) => it.include && !it.applied && it.selectedId).length;
  const missing = items.filter((it) => !it.selectedId && !it.applied).length;

  if (authLoading || !isAdmin) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Reconhecer cartas por foto</h1>
        <p className="text-sm text-muted-foreground">
          Envie fotos das cartas, confira o que foi identificado e valide para somar ao estoque.
        </p>
      </header>

      <div className="rounded-xl border p-4 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={analyzing}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {analyzing ? "Analisando fotos..." : "Enviar fotos (até 6)"}
        </button>
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((p, i) => (
              <img key={i} src={p} alt={`Foto ${i + 1}`} className="h-24 w-auto rounded-md border object-cover" />
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            msg.type === "ok" ? "border-emerald-500/40 text-emerald-600" : "border-destructive/40 text-destructive"
          }`}
        >
          {msg.text}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
          <span>
            <strong>{items.length}</strong> carta(s) identificada(s)
          </span>
          <span className="text-muted-foreground">·</span>
          <span>{pending} pronta(s) para validar</span>
          {missing > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-amber-600">{missing} sem cadastro no site</span>
            </>
          )}
          <button
            type="button"
            onClick={applyStock}
            disabled={applying || pending === 0}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Validar e subir estoque
          </button>
        </div>
      )}

      <div className="grid gap-3">
        {items.map((it) => (
          <div
            key={it.key}
            className={`rounded-xl border p-4 space-y-3 ${it.applied ? "opacity-70" : ""} ${
              !it.include ? "opacity-50" : ""
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={it.include}
                  onChange={(e) => update(it.key, { include: e.target.checked })}
                />
                Incluir
              </label>
              <strong className="text-base">{it.name || "Carta sem nome"}</strong>
              <span className="text-xs text-muted-foreground">
                confiança {Math.round(it.confidence * 100)}% · foto {it.imageIndex + 1}
              </span>
              {it.applied && (
                <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                  Estoque atualizado
                </span>
              )}
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                aria-label="Remover da lista"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {it.notes && <p className="text-xs text-amber-600">{it.notes}</p>}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
              <input
                className="rounded-md border px-2 py-1.5 text-sm lg:col-span-2"
                value={it.name}
                placeholder="Nome"
                onChange={(e) => update(it.key, { name: e.target.value })}
              />
              <input
                className="rounded-md border px-2 py-1.5 text-sm"
                value={it.number}
                placeholder="Número"
                onChange={(e) => update(it.key, { number: e.target.value })}
              />
              <select
                className="rounded-md border px-2 py-1.5 text-sm"
                value={collections.includes(it.collection) ? it.collection : ""}
                onChange={(e) => update(it.key, { collection: e.target.value })}
              >
                <option value="">Coleção…</option>
                {collections.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border px-2 py-1.5 text-sm"
                value={it.language}
                onChange={(e) => update(it.key, { language: e.target.value })}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                className="rounded-md border px-2 py-1.5 text-sm"
                value={it.finish}
                onChange={(e) => update(it.key, { finish: e.target.value })}
              >
                {FINISHES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                Quantidade
                <input
                  type="number"
                  min={1}
                  className="w-20 rounded-md border px-2 py-1.5 text-sm"
                  value={it.quantity}
                  onChange={(e) => update(it.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <button
                type="button"
                onClick={() => research(it)}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                {it.searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Buscar no catálogo
              </button>
            </div>

            {it.candidates.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Carta cadastrada correspondente</p>
                {it.candidates.map((c) => (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                      it.selectedId === c.id ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name={`cand-${it.key}`}
                      checked={it.selectedId === c.id}
                      onChange={() => update(it.key, { selectedId: c.id })}
                    />
                    {c.image ? <img src={c.image} alt="" className="h-10 w-8 rounded object-cover" /> : null}
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">
                      {c.collection} · {c.card_number} · {c.finish} · {c.language} · {c.condition}
                    </span>
                    <span className="ml-auto text-xs">estoque atual: {c.stock}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-3 space-y-2">
                <p className="text-sm text-amber-600">
                  Esta carta ainda não está cadastrada no site. Cadastre aqui mesmo:
                </p>
                <div className="grid gap-2 sm:grid-cols-4">
                  <select
                    className="rounded-md border px-2 py-1.5 text-sm"
                    value={it.newCategory}
                    onChange={(e) => update(it.key, { newCategory: e.target.value })}
                  >
                    {["Pokémon", "Treinador", "Energia"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    className="rounded-md border px-2 py-1.5 text-sm"
                    value={it.newCondition}
                    onChange={(e) => update(it.key, { newCondition: e.target.value })}
                  >
                    <option value="">Condição…</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rounded-md border px-2 py-1.5 text-sm"
                    placeholder="Preço (R$)"
                    value={it.newPrice}
                    onChange={(e) => update(it.key, { newPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => createCard(it)}
                    disabled={it.creating}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {it.creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Cadastrar carta
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A carta é criada com estoque zero; ao validar, a quantidade informada é somada.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
