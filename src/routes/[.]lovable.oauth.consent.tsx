import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { authorizationTarget, type OAuthApi } from '@/lib/oauth-consent';

const oauth = () => supabase.auth.oauth as unknown as OAuthApi;
const unavailable = 'Não foi possível carregar a autorização. Reinicie a conexão no ChatGPT.';
export const Route = createFileRoute('/.lovable/oauth/consent')({
  ssr:false,
  head:()=>({meta:[{title:'Conectar ChatGPT — Sevii Colecionáveis'},{name:'description',content:'Autorize consultas administrativas da Sevii usando sua própria conta.'},{property:'og:title',content:'Conectar sua conta — Sevii Colecionáveis'},{property:'og:description',content:'Autorização individual de acesso às consultas administrativas.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),
  validateSearch:(s:Record<string,unknown>)=>({authorization_id:typeof s.authorization_id === 'string' ? s.authorization_id : ''}),
  beforeLoad:async({search,location})=>{
    if(!search.authorization_id) throw new Error('Autorização ausente. Reinicie a conexão no ChatGPT.');
    const {data,error}=await supabase.auth.getUser();
    if(error || !data.user) throw redirect({to:'/auth',search:{redirect:location.pathname+location.searchStr+location.hash}});
  },
  loader:async({location})=>{
    const id=new URLSearchParams(location.searchStr).get('authorization_id');
    if(!id) throw new Error(unavailable);
    const user=await supabase.auth.getUser();
    if(user.error || !user.data.user) throw new Error(unavailable);
    const access=await supabase.rpc('mcp_admin_access');
    if(access.error) throw new Error('Não foi possível verificar sua permissão. Tente novamente.');
    const audit=await supabase.rpc('record_mcp_access',{_action:'consent',_outcome:access.data === true ? 'allowed':'denied'});
    if(audit.error) throw new Error(unavailable);
    if(access.data !== true) throw new Error('Acesso permitido somente para administradores ativos da Sevii.');
    const {data,error}=await oauth().getAuthorizationDetails(id);
    if(error || !data) throw new Error('Autorização inválida ou expirada. Reinicie a conexão no ChatGPT.');
    const immediate=authorizationTarget(data);
    if(immediate && !data.client) throw redirect({href:immediate});
    return {details:data,email:user.data.user.email};
  },
  pendingComponent:()=> <main className="mx-auto max-w-lg p-8">Carregando autorização…</main>,
  errorComponent:({error})=><main className="mx-auto max-w-lg px-4 py-12"><h1 className="text-2xl font-bold">Conexão não autorizada</h1><p role="alert" className="mt-4 text-muted-foreground">{error instanceof Error ? error.message : unavailable}</p><Button asChild variant="outline" className="mt-6"><Link to="/auth">Entrar em outra conta</Link></Button></main>,
  component:Consent,
});
function Consent(){
  const {details,email}=Route.useLoaderData();
  const {authorization_id}=Route.useSearch();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const name=details.client?.name ?? details.client?.client_name ?? 'ChatGPT';
  const scopes=details.scopes ?? (details.scope ?? '').split(' ').filter(Boolean);
  async function decide(approve:boolean){
    setBusy(true);setError(null);
    try{
      if(approve){
        const access=await supabase.rpc('mcp_admin_access');
        if(access.error || access.data !== true) throw new Error('Sua conta não tem mais permissão administrativa.');
      }
      const {data,error}=approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
      if(error) throw new Error('Não foi possível confirmar sua decisão. Tente novamente.');
      const target=authorizationTarget(data);
      if(!target) throw new Error('O serviço não devolveu o endereço de retorno. Reinicie a conexão.');
      window.location.assign(target);
    }catch(e){setError(e instanceof Error ? e.message : unavailable);setBusy(false);}
  }
  async function switchAccount(){
    setBusy(true);setError(null);
    const {error}=await supabase.auth.signOut();
    if(error){setError('Não foi possível sair da conta.');setBusy(false);return;}
    window.location.assign('/auth?next='+encodeURIComponent(window.location.pathname+window.location.search));
  }
  return <main className="mx-auto max-w-lg px-4 py-12">
    <p className="text-sm font-semibold text-muted-foreground">Sevii Colecionáveis</p>
    <h1 className="mt-3 text-2xl font-bold">Conectar {name} à Sevii Colecionáveis</h1>
    <div className="mt-6 border-y border-border py-4"><p className="text-sm break-all">{email}</p><Button variant="link" className="px-0" disabled={busy} onClick={switchAccount}>Usar outra conta</Button></div>
    <p className="mt-6">{name} poderá consultar a loja como você.</p>
    {details.redirect_uri && <p className="mt-3 break-all text-xs text-muted-foreground">Destino: {details.redirect_uri}</p>}
    <ul className="mt-4 list-disc pl-5 text-sm space-y-2"><li>Vendas, pedidos e envios</li><li>Leilões, clientes e produtos</li><li>Relatórios financeiros e operacionais</li>{scopes.map(scope=><li key={scope}>{scope==='email'?'Compartilhar seu e-mail':scope==='profile'?'Compartilhar seu perfil básico':scope==='openid'?'Confirmar sua identidade':`Permissão adicional solicitada: ${scope}`}</li>)}</ul>
    <p className="mt-5 text-sm text-muted-foreground">Não permite alterar dados. As permissões atuais do site continuam valendo; perder o acesso administrativo bloqueia novas consultas.</p>
    {error && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    <div className="mt-6 flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>decide(true)}>Permitir conexão</Button><Button variant="outline" disabled={busy} onClick={()=>decide(false)}>Cancelar conexão</Button></div>
  </main>;
}
