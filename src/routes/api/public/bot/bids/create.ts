import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";

const EMAIL_DOMAIN = "whatsapp.seviicolecionaveis.com.br";

function randomPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `${out}@1`;
}

type IncomingBid = {
  phone?: string;
  bidder_name?: string;
  item_name?: string;
  item_id?: string;
  amount?: number | string;
  sequence?: number | string;
  quantity?: number;
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
        const auctionNumber = body?.auctionNumber ?? body?.auction_number ?? null;
        const bidsRaw: IncomingBid[] = Array.isArray(body?.bids) ? body.bids : [];
        const createOrders = body?.create_orders !== false;

        if (!auctionId) return Response.json({ error: "auctionId obrigatório" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auction } = await (supabaseAdmin as any)
          .from("auctions")
          .select("id, auction_number, title")
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
            const quantity = Number(b.quantity ?? 1) || 1;
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
              card_image: match?.image_url ?? null,
              phone,
              bidder_name: b.bidder_name ? String(b.bidder_name) : null,
              amount,
              quantity,
              status: "approved",
            };
          })
          .filter(Boolean) as any[];

        if (rows.length > 0) {
          // Insere lances aprovados
          const insertPayload = rows.map((r) => ({
            auction_id: r.auction_id,
            item_id: r.item_id,
            sequence: r.sequence,
            item_name: r.item_name,
            phone: r.phone,
            bidder_name: r.bidder_name,
            amount: r.amount,
            status: "approved",
          }));
          const { error } = await (supabaseAdmin as any).from("auction_bids").insert(insertPayload);
          if (error) {
            console.error("[bids/create] Erro ao inserir auction_bids:", error.message);
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

        // Se createOrders = false ou sem lances, retorna resultado simples
        if (!createOrders || rows.length === 0) {
          return Response.json({
            success: true,
            message: "Lances processados com sucesso",
            auctionId,
            inserted: rows.length,
            orders: [],
          });
        }

        // Agrupar vencedores por telefone para gerar 1 pedido por arrematante
        const bidsByPhone = new Map<string, any[]>();
        for (const r of rows) {
          const list = bidsByPhone.get(r.phone) ?? [];
          list.push(r);
          bidsByPhone.set(r.phone, list);
        }

        const ordersResult: any[] = [];
        const errors: any[] = [];

        for (const [phone, buyerBids] of bidsByPhone.entries()) {
          try {
            const bidderName = buyerBids.find((b) => b.bidder_name)?.bidder_name || phone;

            // 1. Localiza ou cria o usuário
            const { data: prof } = await (supabaseAdmin as any)
              .from("profiles")
              .select("user_id")
              .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
              .maybeSingle();

            let userId: string | null = prof?.user_id ?? null;
            let userCreated = false;
            let tempPassword = "";

            const email = `${phone}@${EMAIL_DOMAIN}`;

            if (!userId) {
              tempPassword = randomPassword();
              const { data: createdUser, error: createErr } =
                await supabaseAdmin.auth.admin.createUser({
                  email,
                  password: tempPassword,
                  email_confirm: true,
                  user_metadata: {
                    full_name: bidderName,
                    phone,
                    source: "auction",
                  },
                });

              if (createErr) {
                // Tenta localizar se usuário já existia com esse e-mail no auth
                const { data: list } = await supabaseAdmin.auth.admin.listUsers({
                  page: 1,
                  perPage: 200,
                });
                const found = list?.users?.find((u) => u.email === email);
                if (found) {
                  userId = found.id;
                } else {
                  console.error(
                    `[bids/create] Falha ao criar auth user para ${phone}:`,
                    createErr.message,
                  );
                }
              } else {
                userId = createdUser.user?.id ?? null;
                userCreated = true;
              }
            }

            if (userId) {
              await (supabaseAdmin as any).from("profiles").upsert(
                {
                  user_id: userId,
                  full_name: bidderName,
                  phone,
                  whatsapp: phone,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "user_id" },
              );
            }

            if (!userId) {
              errors.push({ phone, error: "Não foi possível vincular/criar usuário" });
              continue;
            }

            // 2. Calcula valores do pedido
            const subtotalCents = Math.round(
              buyerBids.reduce(
                (sum, b) => sum + Number(b.amount) * (Number(b.quantity) || 1) * 100,
                0,
              ),
            );
            const totalCents = subtotalCents;
            const leilaoNum = auctionNumber || auction.auction_number || auctionId.slice(0, 8);
            const notes = `Arremate Leilão #${leilaoNum}`;

            // 3. Cria o pedido em public.orders
            const { data: order, error: orderErr } = await (supabaseAdmin as any)
              .from("orders")
              .insert({
                user_id: userId,
                status: "pending",
                payment_method: "pix",
                shipping_method: "arrange",
                shipping_cost_cents: 0,
                subtotal_cents: subtotalCents,
                total_cents: totalCents,
                discount_cents: 0,
                bundle_discount_cents: 0,
                coupon_discount_cents: 0,
                pix_discount_cents: 0,
                recipient_name: bidderName,
                phone,
                email,
                cep: "00000-000",
                street: "A combinar",
                number: "S/N",
                neighborhood: "A combinar",
                city: "A combinar",
                state: "SP",
                notes,
              })
              .select("id")
              .single();

            if (orderErr || !order) {
              console.error(`[bids/create] Erro ao criar pedido para ${phone}:`, orderErr?.message);
              errors.push({ phone, error: orderErr?.message ?? "Falha ao criar pedido" });
              continue;
            }

            const orderId = order.id;
            const orderNumber = orderId.slice(0, 8).toUpperCase();

            // 4. Cria os itens do pedido em public.order_items
            const orderItems = buyerBids.map((b) => ({
              order_id: orderId,
              card_id: `auction:${b.item_id || b.sequence}`,
              card_name: b.item_name || `Lote ${b.sequence}`,
              card_image: b.card_image ?? null,
              quantity: b.quantity || 1,
              unit_price_cents: Math.round(Number(b.amount) * 100),
            }));

            const { error: itemsErr } = await (supabaseAdmin as any)
              .from("order_items")
              .insert(orderItems);
            if (itemsErr) {
              console.error(
                `[bids/create] Erro ao inserir order_items para ${orderId}:`,
                itemsErr.message,
              );
            }

            // 5. Atualiza os lances para status = 'order_created' com order_id
            await (supabaseAdmin as any)
              .from("auction_bids")
              .update({ status: "order_created", order_id: orderId })
              .eq("auction_id", auctionId)
              .eq("phone", phone);

            ordersResult.push({
              orderId,
              orderNumber,
              phone,
              total: subtotalCents / 100,
              payment_link: `https://seviicolecionaveis.com.br/pay/${orderId}`,
              order_link: `https://seviicolecionaveis.com.br/orders/${orderId}`,
              user: {
                login: email,
                password: userCreated ? tempPassword : null,
                created: userCreated,
              },
              items: buyerBids.map((b) => ({
                product_name: b.item_name || `Lote ${b.sequence}`,
                unit_price: Number(b.amount),
                quantity: b.quantity || 1,
              })),
            });
          } catch (buyerErr: any) {
            console.error(`[bids/create] Erro ao processar arrematante ${phone}:`, buyerErr);
            errors.push({ phone, error: buyerErr?.message ?? "Erro desconhecido" });
          }
        }

        return Response.json({
          success: errors.length === 0,
          message: "Pedidos gerados com sucesso",
          auctionId,
          inserted: rows.length,
          orders: ordersResult,
          errors: errors.length > 0 ? errors : undefined,
        });
      },
    },
  },
});
