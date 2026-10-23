import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

async function checkIsAdmin(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("[AuthProvider] Falha ao verificar admin", error);
    return false;
  }

  return !!data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      const nextUserId = s?.user?.id ?? null;
      setSession(s);
      setUser(s?.user ?? null);
      if (nextUserId === currentUserIdRef.current) {
        // Mesma sessão (ex: TOKEN_REFRESHED ao voltar pra aba) — não re-disparar loading.
        return;
      }
      currentUserIdRef.current = nextUserId;
      if (!s?.user) {
        setIsAdmin(false);
        return;
      }
      setTimeout(async () => {
        // Junta pedidos/pilha feitos pelo bot do WhatsApp com o mesmo telefone
        void (supabase as any).rpc("claim_my_whatsapp_orders").then(() => {}, () => {});
        setIsAdmin(await checkIsAdmin(s.user.id));
      }, 0);
    });

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      currentUserIdRef.current = s?.user?.id ?? null;
      if (s?.user) {
        setIsAdmin(await checkIsAdmin(s.user.id));
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ user, session, isAdmin, loading, signOut: async () => { await supabase.auth.signOut(); } }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
