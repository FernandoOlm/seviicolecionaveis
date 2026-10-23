import { describe,it,expect,vi,beforeEach } from 'vitest';
import { AuthContext,ToolContext } from '@lovable.dev/mcp-js';
const state=vi.hoisted(()=>({allowed:true,error:false,audit:[] as {action:string;outcome:string}[]}));
vi.mock('./supabase',()=>({supabaseForUser:()=>({rpc:async(name:string,args?:{_action:string;_outcome:string})=>{
  if(name==='mcp_admin_access') return {data:state.allowed,error:state.error ? {message:'permission check failed'} : null};
  if(args) state.audit.push({action:args._action,outcome:args._outcome});
  return {data:null,error:null};
}})}));
import {adminRead,adminVisible,currentAdmin,loadAdminContext,type AdminContext} from './access';
import mcp from './index';
import {createTanStackMcpHandler} from '@lovable.dev/mcp-js/stacks/tanstack';

const ctx=()=>new ToolContext<AdminContext>(undefined,undefined,{canReadAdmin:true});
beforeEach(()=>{state.allowed=true;state.error=false;state.audit=[];});
describe('Live site authorization — synthetic principals only',()=>{
  it('allows a current admin and records only allowlisted metadata',async()=>{
    const result=await adminRead(ctx(),'listar_pedidos',async()=>({pedidos:[]}));
    expect(result.content[0]?.text).toBe('{"pedidos":[]}');
    expect(state.audit).toEqual([{action:'listar_pedidos',outcome:'allowed'}]);
  });
  it('blocks an ordinary user before querying any rows',async()=>{
    state.allowed=false;const read=vi.fn();
    await expect(adminRead(ctx(),'listar_clientes',read)).rejects.toThrow('administradores ativos');
    expect(read).not.toHaveBeenCalled();
    expect(state.audit[0]?.outcome).toBe('denied');
  });
  it('blocks role removal on an already connected context',async()=>{
    const same=ctx();await adminRead(same,'listar_pedidos',async()=>[]);
    state.allowed=false;
    await expect(adminRead(same,'listar_pedidos',async()=>[])).rejects.toThrow('administradores ativos');
  });
  it('permits newly assigned admins without a separate registration',async()=>{
    state.allowed=false;await expect(adminRead(ctx(),'listar_leiloes',async()=>[])).rejects.toThrow();
    state.allowed=true;await expect(adminRead(ctx(),'listar_leiloes',async()=>[])).resolves.toHaveProperty('content');
  });
  it('blocks a disabled account using the live eligibility result',async()=>{
    state.allowed=false;await expect(adminRead(ctx(),'meu_perfil',async()=>[])).rejects.toThrow();
  });
  it('does not release records if admin permission changes during query',async()=>{
    await expect(adminRead(ctx(),'listar_pedidos',async()=>{state.allowed=false;return ['private'];})).rejects.toThrow('removida');
    expect(state.audit).toEqual([{action:'listar_pedidos',outcome:'denied'}]);
  });
  it('fails closed on permission-service errors',async()=>{
    state.error=true;const read=vi.fn();
    await expect(adminRead(ctx(),'meu_perfil',read)).rejects.toThrow('validar');expect(read).not.toHaveBeenCalled();
  });
  it('redacts query failures and audits errors without arguments or results',async()=>{
    await expect(adminRead(ctx(),'listar_clientes',async()=>{throw new Error('secret customer payload');})).rejects.toThrow('Não foi possível concluir');
    expect(state.audit).toEqual([{action:'listar_clientes',outcome:'error'}]);
  });
  it('hides every admin tool from non-admin catalogs',async()=>{
    expect(adminVisible({appContext:{canReadAdmin:false}})).toBe(false);
    expect(await loadAdminContext(new AuthContext(undefined))).toEqual({canReadAdmin:false});
    expect(mcp.tools.every(t=>typeof t.enabled==='function')).toBe(true);
  });
  it('exposes 9 read and 10 write tools only to eligible admins',()=>{
    expect(mcp.tools.length).toBe(19);
    expect(mcp.tools.every(t=>typeof t.enabled==='function')).toBe(true);
    expect(mcp.tools.filter(t=>t.annotations?.readOnlyHint===true).length).toBe(9);
    for (const n of ['alterar_status_pedido','encerrar_leilao']) expect(mcp.tools.find(t=>t.name===n)?.annotations?.destructiveHint).toBe(true);
    expect(mcp.auth?.requireOAuthClientClaim).toBe(true);
  });
});
describe('Real SDK transport',()=>{
  const handler=createTanStackMcpHandler(mcp,{resourcePath:'/mcp'});
  it('rejects missing OAuth bearer',async()=>{
    const response=await handler({request:new Request('https://seviicolecionaveis.com.br/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})});
    expect(response.status).toBe(401);expect(response.headers.get('www-authenticate')).toContain('oauth-protected-resource');
  });
  it('rejects copied or invalid tokens',async()=>{
    const response=await handler({request:new Request('https://seviicolecionaveis.com.br/mcp',{method:'POST',headers:{authorization:'Bearer not-a-jwt','content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})});
    expect(response.status).toBe(401);
  });
  it('does not permit arbitrary browser origins',async()=>{
    const response=await handler({request:new Request('https://seviicolecionaveis.com.br/mcp',{method:'OPTIONS',headers:{origin:'https://attacker.example'}})});
    expect(response.status).toBe(403);
  });
});
