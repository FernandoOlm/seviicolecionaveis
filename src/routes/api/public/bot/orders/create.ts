import { createFileRoute } from "@tanstack/react-router";
import { verifyBotAuth } from "@/lib/bot-auth.server";
import { ensureWhatsAppUser } from "@/lib/bot-users.server";

const SITE_URL = "https://seviicolecionaveis.com.br";

export const Route = createFileRoute("/api/public/bot/orders/create")({
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

        const phone = String(body?.phone ?? "").replace(/\D/g, "");
        if (!phone) {
          return Response.json({ error: "Telefone do arrematante é obrigatório" }, { status: 400 });
        }

        const rawName = body?.name || body?.bidder_name || body?.recipient_name;
        const name = rawName ? String(rawName).trim().slice(0, 120) : null;
        const auctionId = body?.auctionId || body?.auction_id ? String(body.auctionId || body.auction_id) : null;
        const groupJid = body?.group_jid ? String(body.group_jid) : null;
        const groupName = body?.group_name ? String(body.group_name) : null;
        const rawItems = Array.isArray(body?.items) ? body.items : [];

        if (rawItems.length === 0) {
          return Response.json({ error: "Nenhum item informado para o pedido" }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Idempotência: Se informado auctionId e phone, verifica se já existe pedido não cancelado
        if (auctionId) {
          const { data: existingOrder } = await (supabaseAdmin as any)
            .from("orders")
            .select("id, total_cents, subtotal_cents, status, created_at")
            .eq("auction_id", auctionId)
            .eq("phone", phone)
            .neq("status", "cancelled")
            .maybeSingle();

          if (existingOrder) {
            console.log(`[ORDER-CREATE] Idempotência ativada: pedido já existente ${existingOrder.id} para leilão ${auctionId} e fone ${phone}`);
            return Response.json({
              success: true,
              duplicated: true,
              message: "Pedido já registrado anteriormente para este arrematante e leilão",
              orderId: existingOrder.id,
              orderNumber: String(existingOrder.id).slice(0, 8).toUpperCase(),
              total: (existingOrder.total_cents ?? 0) / 100,
              payment_link: `${SITE_URL}/pay/${existingOrder.id}`,
              order_link: `${SITE_URL}/orders/${existingOrder.id}`,
              items: rawItems,
            });
          }
        }

        // 2. Localiza ou cria usuário WhatsApp
        const user = await ensureWhatsAppUser(phone, name);
        if ("error" in user) {
          return Response.json({ error: user.error }, { status: 500 });
        }

        // 3. Normaliza itens e calcula totais
        const items = rawItems.map((it: any, index: number) => {
          const unitPrice = Number(it.unit_price ?? it.amount ?? (Number(it.unit_price_cents || 0) / 100)) || 0;
          const quantity = Math.max(1, Number(it.quantity) || 1);
          const unitPriceCents = Math.round(unitPrice * 100);
          const productName = String(it.product_name ?? it.card_name ?? it.name ?? `Lote ${index + 1}`).trim();
          const cardId = it.card_id ?? it.product_id ? String(it.card_id ?? it.product_id) : (auctionId ? `auction:${auctionId}:${index + 1}` : null);
          const cardImage = it.card_image ?? it.image_url ?? null;

          return {
            productName,
            cardId,
            cardImage,
            quantity,
            unitPrice,
            unitPriceCents,
          };
        });

        const subtotalCents = items.reduce((sum: number, it: any) => sum + (it.unitPriceCents * it.quantity), 0);
        const shippingCostCents = Math.max(0, Math.round(Number(body?.shipping_cost_cents ?? 0)));
        const totalCents = subtotalCents + shippingCostCents;

        let notes = body?.notes ? String(body.notes).trim() : "Pedido de leilão gerado via bot";
        if (groupName && !notes.includes(groupName)) {
          notes += ` (Grupo: ${groupName})`;
        } else if (groupJid && !notes.includes(groupJid)) {
          notes += ` (Grupo: ${groupJid})`;
        }

        // 4. Cria pedido com origin "auction"
        const { data: newOrder, error: orderErr } = await (supabaseAdmin as any)
          .from("orders")
          .insert({
            user_id: user.userId,
            status: "pending",
            origin: "auction",
            auction_id: auctionId,
            payment_method: "pix",
            shipping_method: "arrange",
            shipping_cost_cents: shippingCostCents,
            subtotal_cents: subtotalCents,
            total_cents: totalCents,
            recipient_name: name || phone,
            phone,
            email: user.email,
            cep: "00000000",
            street: "A combinar",
            number: "S/N",
            neighborhood: "A combinar",
            city: "A combinar",
            state: "SP",
            notes,
          })
          .select("id, total_cents, created_at")
          .single();

        if (orderErr || !newOrder) {
          console.error("[ORDER-CREATE] Erro ao persistir pedido:", orderErr);
          return Response.json({ error: orderErr?.message ?? "Falha ao persistir pedido" }, { status: 500 });
        }

        // 5. Cria os itens do pedido
        const itemRows = items.map((it: any) => ({
          order_id: newOrder.id,
          card_id: it.cardId,
          card_name: it.productName,
          card_image: it.cardImage,
          collection: auctionId ? `Leilão` : "Leilão Bot",
          card_number: "1",
          quantity: it.quantity,
          unit_price_cents: it.unitPriceCents,
        }));

        const { error: itemsErr } = await (supabaseAdmin as any)
          .from("order_items")
          .insert(itemRows);

        if (itemsErr) {
          console.error("[ORDER-CREATE] Erro ao inserir itens do pedido:", itemsErr);
        }

        return Response.json({
          success: true,
          orderId: newOrder.id,
          orderNumber: String(newOrder.id).slice(0, 8).toUpperCase(),
          phone,
          total: totalCents / 100,
          payment_link: `${SITE_URL}/pay/${newOrder.id}`,
          order_link: `${SITE_URL}/orders/${newOrder.id}`,
          user: {
            login: user.email,
            ...(user.password ? { password: user.password } : {}),
            created: user.created,
          },
          items: items.map((it: any) => ({
            product_name: it.productName,
            unit_price: it.unitPrice,
            quantity: it.quantity,
          })),
        });
      },
    },
  },
});
