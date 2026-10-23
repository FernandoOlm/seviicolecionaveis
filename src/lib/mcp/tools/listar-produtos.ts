import { z } from 'zod';
import { defineAdminTool, adminVisible, readAnnotations, adminRead } from '../access';
import { pagination } from '../read-rules';
export default defineAdminTool({ name: 'listar_produtos', title: 'Produtos e estoque', description: 'Consulta cartas, lacrados, acessórios ou videogames com preço e estoque.', inputSchema: { ...pagination, tipo:z.enum(['cartas','lacrados','acessorios','videogames']).default('cartas').describe('Categoria do catálogo.') }, enabled:adminVisible, annotations:readAnnotations,
  handler: ({ pagina, limite, tipo },ctx) => adminRead(ctx,'listar_produtos',async db => {
    const from = (pagina-1)*limite;
    const to = pagina*limite-1;
    if (tipo === 'cartas') {
      const { data,count,error } = await db.from('cards').select('id,name,collection,card_number,base_price_cents,stock,finish,language,condition',{count:'exact'}).order('name').range(from,to).abortSignal(ctx.signal);
      if(error) throw error;
      return {tipo,produtos:data,total:count,pagina};
    }
    const table = tipo === 'lacrados' ? 'sealed_products' : tipo === 'acessorios' ? 'accessories' : 'videogames';
    const {data,count,error} = await db.from(table).select('id,title,price_cents,stock,active',{count:'exact'}).order('title').range(from,to).abortSignal(ctx.signal);
    if(error) throw error;
    return {tipo,produtos:data,total:count,pagina};
  }),
});
