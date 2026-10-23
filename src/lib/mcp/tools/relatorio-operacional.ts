import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
export default defineAdminTool({ name:'relatorio_operacional',title:'Relatório operacional',description:'Conta pedidos pendentes, enviados, reagendamentos e pilhas ativas no momento da consulta.',inputSchema:{},enabled:adminVisible,annotations:readAnnotations,
  handler:(_,ctx)=>adminRead(ctx,'relatorio_operacional',async db=>{
    const results=await Promise.all([
      db.from('orders').select('id',{count:'exact',head:true}).eq('status','pending').abortSignal(ctx.signal),
      db.from('orders').select('id',{count:'exact',head:true}).eq('status','shipped').abortSignal(ctx.signal),
      db.from('orders').select('id',{count:'exact',head:true}).eq('reschedule_required',true).abortSignal(ctx.signal),
      db.from('card_stacks').select('id',{count:'exact',head:true}).eq('status','active').abortSignal(ctx.signal),
    ]);
    if(results.some(r=>r.error)) throw new Error('Query failed');
    return {pedidos_pendentes:results[0]?.count, enviados:results[1]?.count, reagendamentos:results[2]?.count, pilhas_ativas:results[3]?.count};
  }),
});
