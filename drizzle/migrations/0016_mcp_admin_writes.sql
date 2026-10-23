CREATE TABLE public.mcp_write_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  action text NOT NULL,
  target_id text,
  changed_fields text[] NOT NULL DEFAULT '{}',
  outcome text NOT NULL DEFAULT 'started',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
GRANT SELECT, INSERT, UPDATE ON public.mcp_write_log TO authenticated;
GRANT ALL ON public.mcp_write_log TO service_role;
ALTER TABLE public.mcp_write_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins log own MCP writes" ON public.mcp_write_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.mcp_admin_access());
CREATE POLICY "Admins read MCP writes" ON public.mcp_write_log FOR SELECT TO authenticated USING (public.mcp_admin_access());
CREATE POLICY "Admins finish own MCP writes" ON public.mcp_write_log FOR UPDATE TO authenticated USING (user_id = auth.uid() AND public.mcp_admin_access()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_mcp_access(_action text, _outcome text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF _action NOT IN ('catalog','consent','meu_perfil','resumo_vendas','listar_pedidos','obter_pedido','listar_envios','listar_leiloes','listar_clientes','listar_produtos','relatorio_operacional','atualizar_pedido','alterar_status_pedido','atualizar_rastreamento','criar_produto','editar_produto','atualizar_estoque','criar_leilao','editar_leilao','encerrar_leilao','atualizar_cliente') OR _outcome NOT IN ('allowed','denied','error') THEN RAISE EXCEPTION 'Invalid audit event'; END IF; INSERT INTO public.mcp_access_audit(user_id,action,outcome) VALUES (auth.uid(),_action,_outcome); END; $$;

CREATE OR REPLACE FUNCTION public.mcp_update_customer(_user_id uuid, _full_name text, _phone text, _whatsapp text, _birth_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.profiles;
BEGIN
  IF NOT public.mcp_admin_access() THEN RAISE EXCEPTION 'Admin required'; END IF;
  UPDATE public.profiles SET
    full_name = COALESCE(NULLIF(btrim(_full_name),''), full_name),
    phone = COALESCE(NULLIF(btrim(_phone),''), phone),
    whatsapp = COALESCE(NULLIF(btrim(_whatsapp),''), whatsapp),
    birth_date = COALESCE(_birth_date, birth_date),
    updated_at = now()
  WHERE user_id = _user_id RETURNING * INTO r;
  IF r.user_id IS NULL THEN RAISE EXCEPTION 'Cliente não encontrado'; END IF;
  RETURN jsonb_build_object('user_id', r.user_id, 'full_name', r.full_name, 'birth_date', r.birth_date);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_update_customer(uuid,text,text,text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_update_customer(uuid,text,text,text,date) TO authenticated;