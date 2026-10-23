import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Sevii Colecionáveis" },
      { name: "description", content: "Entre na sua conta Sevii Colecionáveis para acompanhar pedidos, gerenciar favoritos e finalizar compras de cartas Pokémon." },
      { property: "og:title", content: "Entrar — Sevii Colecionáveis" },
      { property: "og:description", content: "Acesse sua conta para gerenciar pedidos e favoritos." },
      { property: "og:url", content: "https://seviicolecionaveis.lovable.app/auth" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://seviicolecionaveis.lovable.app/auth" }],
  }),
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => {
    const r = typeof s.redirect === "string" ? s.redirect : undefined;
    return r && r.startsWith("/") && !r.startsWith("//") ? { redirect: r } : {};
  },
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { redirect } = Route.useSearch();
  const goAfter = () => {
    if (redirect) window.location.assign(redirect);
    else nav({ to: "/" });
  };
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName, whatsapp, birth_date: birthDate || null },
          },
        });
        if (error) throw error;
        goAfter();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Enviamos um link de recuperação para o seu e-mail.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        goAfter();
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Recuperar senha";
  const subtitle =
    mode === "login"
      ? "Acesse sua conta para finalizar compras."
      : mode === "signup"
      ? "Cadastre-se para acompanhar seus pedidos."
      : "Informe seu e-mail e enviaremos um link para redefinir sua senha.";

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Link to="/" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
          ← Voltar ao catálogo
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide mb-1">Nome completo</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </div>
          )}
          {mode === "signup" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-1">WhatsApp</label>
                <input
                  required
                  value={whatsapp}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                    const masked = d.length <= 2 ? d : d.length <= 7 ? `(${d.slice(0,2)}) ${d.slice(2)}` : `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
                    setWhatsapp(masked);
                  }}
                  placeholder="(11) 99999-9999"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide mb-1">Nascimento</label>
                <input
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide mb-1">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium uppercase tracking-wide">Senha</label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setErr(null); setInfo(null); }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
          {info && <p className="text-sm text-green-600">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-foreground text-background py-2.5 text-sm font-semibold uppercase tracking-wide disabled:opacity-50"
          >
            {loading ? "..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </button>
        </form>

        {mode === "forgot" ? (
          <button
            onClick={() => { setMode("login"); setErr(null); setInfo(null); }}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao login
          </button>
        ) : (
          <button
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(null); setInfo(null); }}
            className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
          </button>
        )}
      </div>
    </div>
  );
}
