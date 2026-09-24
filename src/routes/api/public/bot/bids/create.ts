import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";
import { ensureWhatsAppUser } from "@/lib/bot-users.server";

const SITE_URL = "https://seviicolecionaveis.com.br";

type IncomingBid = {
  phone?: string;
  bidder_name?: string;
  item_name?: string;
  item_id?: string;
  amount?: number | string;
  sequence?: number | string;
  quantity?: number | string;
};

export const Route = createFileRoute("/api/public/bot/bids/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = verifyBotAuth(request);
        if (denied) return denied;

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        const auctionId = String(body?.auctionId ?? body?.auction_id ?? "");
        const bidsRaw: IncomingBid[] = Array.isArray(body?.bids) ? body.bids : [];
        // Por padrão gera os pedidos; envie create_orders: false para apenas registrar lances.
        const createOrders = body?.create_orders !== false;
        if (!auctionId) return Response.json({ error: "auctionId obrigatório" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auction } = await (supabaseAdmin as any)
          .from("auctions")
          .select("id, auction_number")
          .eq("id", auctionId)
          .maybeSingle();
        if (!auction) return Response.json({ error: "Leilão não encontrado" }, { status: 404 });

        const { data: items } = await (supabaseAdmin as any)
          .from("auction_items")
          .select("id, sequence, name, image_url")
          .eq("auction_id", auctionId);

        const rows = bidsRaw
          .map((b) => {
            const phone = String(b.phone ?? "").replace(/\D/g, "");
            const amount = Number(b.amount);
            const sequence = Number(b.sequence ?? 1) || 1;
            const itemName = String(b.item_name ?? "").trim();
            if (!phone || !Number.isFinite(amount) || amount <= 0) return null;
            const match =
              (items ?? []).find((i: any) => (b.item_id ? i.id === b.item_id : false)) ??
              (items ?? []).find((i: any) => i.sequence === sequence) ??
              (items ?? []).find((i: any) => i.name?.toLowerCase() === itemName.toLowerCase());
            return {
              auction_id: auctionId,
              item_id: match?.id ?? null,
              sequence: match?.sequence ?? sequence,
              item_name: itemName || match?.name || `Lote ${sequence}`,
              phone,
              bidder_name: b.bidder_name ? String(b.bidder_name).slice(0, 120) : null,
              amount,
              status: "approved",
              image_url: match?.image_url ?? null,
              quantity: Math.max(1, Number(b.quantity ?? 1) || 1),
            };
          })
          .filter(Boolean) as any[];

        const insertedIds = new Map<string, string>(); // chave lote+telefone -> bid id
        if (rows.length > 0) {
          // Idempotência de lances: verifica lances já gravados para este leilão
          const { data: existingBids } = await (supabaseAdmin as any)
            .from("auction_bids")
            .select("id, phone, sequence, item_name")
            .eq("auction_id", auctionId);

          const existingBidKeys = new Set(
            (existingBids ?? []).map((b: any) => `${b.phone}:${b.sequence}:${b.item_name}`)
          );
          for (const b of existingBids ?? []) {
            insertedIds.set(`${b.phone}:${b.sequence}:${b.item_name}`, b.id);
          }

          const rowsToInsert = rows.filter(
            (r) => !existingBidKeys.has(`${r.phone}:${r.sequence}:${r.item_name}`)
          );

          if (rowsToInsert.length > 0) {
            const { data: inserted, error } = await (supabaseAdmin as any)
              .from("auction_bids")
              .insert(
                rowsToInsert.map((r) => ({
                  auction_id: r.auction_id,
                  item_id: r.item_id,
                  sequence: r.sequence,
                  item_name: r.item_name,
                  phone: r.phone,
                  bidder_name: r.bidder_name,
                  amount: r.amount,
                  status: r.status,
                })),
              )
              .select("id, phone, sequence, item_name");
            if (error) return Response.json({ error: error.message }, { status: 500 });
            for (const b of inserted ?? []) {
              insertedIds.set(`${b.phone}:${b.sequence}:${b.item_name}`, b.id);
            }
          }

          // Marca vencedores nos lotes (maior lance por lote)
          const best = new Map<string, any>();
          for (const r of rows) {
            if (!r.item_id) continue;
            const cur = best.get(r.item_id);
            if (!cur || r.amount > cur.amount) best.set(r.item_id, r);
          }
          for (const [itemId, r] of best) {
            await (supabaseAdmin as any)
              .from("auction_items")
              .update({
                winner_phone: r.phone,
                winner_name: r.bidder_name,
                final_bid: r.amount,
                status: "sold",
              })
              .eq("id", itemId);
          }
        }

        // Finaliza o leilão
        await (supabaseAdmin as any)
          .from("auctions")
          .update({ status: "finished", closed_at: new Date().toISOString() })
          .eq("id", auctionId);

        if (!createOrders || rows.length === 0) {
          return Response.json({
            success: true,
            message: "Lances registrados",
            inserted: rows.length,
            orders: [],
          });
        }

        // Agrupa por telefone e cria um pedido por arrematante (com idempotência)
        const byPhone = new Map<string, any[]>();
        for (const r of rows) {
          const list = byPhone.get(r.phone) ?? [];
          list.push(r);
          byPhone.set(r.phone, list);
        }

        const orders: any[] = [];
        const errors: any[] = [];

        for (const [phone, bids] of byPhone) {
          const bidderName = bids.find((b) => b.bidder_name)?.bidder_name ?? phone;
          const user = await ensureWhatsAppUser(phone, bidderName);
          if ("error" in user) {
            errors.push({ phone, error: user.error });
            continue;
          }

          const subtotalCents = bids.reduce(
            (sum, b) => sum + Math.round(Number(b.amount) * 100) * b.quantity,
            0,
          );

          // IDEMPOTÊNCIA: Verifica se já existe pedido ativo para este leilão e telefone
          const { data: existingOrder } = await (supabaseAdmin as any)
            .from("orders")
            .select("id, total_cents, created_at")
            .eq("auction_id", auctionId)
            .eq("phone", phone)
            .neq("status", "cancelled")
            .maybeSingle();

          let order = existingOrder;
          if (!order) {
            const groupInfo = body?.group_name
              ? ` - Grupo: ${body.group_name}`
              : body?.group_jid
                ? ` - Grupo: ${body.group_jid}`
                : "";

            const { data: newOrder, error: orderErr } = await (supabaseAdmin as any)
              .from("orders")
              .insert({
                user_id: user.userId,
                status: "pending",
                origin: "auction",
                auction_id: auctionId,
                payment_method: "pix",
                shipping_method: "arrange",
                shipping_cost_cents: 0,
                subtotal_cents: subtotalCents,
                total_cents: subtotalCents,
                recipient_name: bidderName,
                phone,
                email: user.email,
                cep: "00000000",
                street: "A combinar",
                number: "S/N",
                neighborhood: "A combinar",
                city: "A combinar",
                state: "SP",
                notes: `Pedido gerado pelo leilão #${auction.auction_number ?? ""}${groupInfo} (WhatsApp).`,
              })
              .select("id, total_cents, created_at")
              .single();

            if (orderErr || !newOrder) {
              errors.push({ phone, error: orderErr?.message ?? "Falha ao criar pedido" });
              continue;
            }
            order = newOrder;

            const itemRows = bids.map((b) => ({
              order_id: order.id,
              card_id: b.item_id ? `auction:${b.item_id}` : `auction:${auctionId}:${b.sequence}`,
              card_name: b.item_name,
              card_image: b.image_url,
              collection: `Leilão #${auction.auction_number ?? ""}`.trim(),
              card_number: String(b.sequence),
              quantity: b.quantity,
              unit_price_cents: Math.round(Number(b.amount) * 100),
            }));
            const { error: itemsErr } = await (supabaseAdmin as any)
              .from("order_items")
              .insert(itemRows);
            if (itemsErr) errors.push({ phone, error: itemsErr.message });
          }

          // Vincula os lances ao pedido criado
          const bidIds = bids
            .map((b) => insertedIds.get(`${b.phone}:${b.sequence}:${b.item_name}`))
            .filter(Boolean) as string[];
          if (bidIds.length > 0) {
            await (supabaseAdmin as any)
              .from("auction_bids")
              .update({ status: "order_created", order_id: order.id })
              .in("id", bidIds);
          }


          orders.push({
            orderId: order.id,
            orderNumber: String(order.id).slice(0, 8).toUpperCase(),
            phone,
            total: subtotalCents / 100,
            payment_link: `${SITE_URL}/pay/${order.id}`,
            order_link: `${SITE_URL}/orders/${order.id}`,
            user: {
              login: user.email,
              ...(user.password ? { password: user.password } : {}),
              created: user.created,
            },
            items: bids.map((b) => ({
              product_name: b.item_name,
              unit_price: Number(b.amount),
              quantity: b.quantity,
            })),
          });
        }

        return Response.json({
          success: errors.length === 0,
          message:
            errors.length === 0
              ? "Pedidos gerados com sucesso"
              : "Pedidos gerados com falhas parciais",
          auctionId,
          inserted: rows.length,
          orders,
          ...(errors.length > 0 ? { errors } : {}),
        });
      },
    },
  },
});
