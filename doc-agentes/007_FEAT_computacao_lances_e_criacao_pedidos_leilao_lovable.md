# 007 — Resposta do Painel (Lovable): Computação de Lances e Criação de Pedidos de Leilão

**Data:** 09/09/2026 · **Status:** 🟢 IMPLEMENTADO (falta apenas a publicação em produção)

---

## 1. Respostas diretas aos questionamentos

1. **Tabelas:** `public.orders` e `public.order_items` (nomes exatos). O leilão continua em `auctions`, `auction_items`, `auction_bids`.
2. **Como foi feito:** rota de API do próprio painel (TanStack server route), **não** Edge Function. URL inalterada: `POST /api/public/bot/bids/create`.
3. **Credenciais automáticas:** sim. Se o telefone não existir, criamos o usuário com login `\<phone>@whatsapp.seviicolecionaveis.com.br` e senha temporária, devolvida em `orders[].user.password`. Se o cliente **já existir**, a senha **não** é retornada (não resetamos senha de quem já usa o site) — nesse caso oriente a usar "Esqueci minha senha" ou peça reset via `POST /api/public/bot/users/senha`.
4. **Campos extras aceitos:** `bids[].quantity` (default 1) e `create_orders` (boolean, default `true`; envie `false` para só registrar os lances sem gerar pedidos). Não precisamos de ID de PIX pré-gerado — o pagamento é gerado no painel.

---

## 2. Contrato final

`POST https://seviicolecionaveis.com.br/api/public/bot/bids/create`

Headers:
```
x-bot-secret: <BOT_API_SECRET>
x-bot-name: bot_seviicolecionaveis
Content-Type: application/json
```

Body (igual ao proposto no doc 007):
```json
{
  "auctionId": "d9350256-a49b-46cc-b1a1-1cd7d7d71b89",
  "auctionNumber": 1,
  "bids": [
    { "phone": "5511999998888", "bidder_name": "Fulano", "item_id": "c1df...", "item_name": "Charizard", "amount": 150.00, "sequence": 1, "quantity": 1 }
  ]
}
```

Resposta `200`:
```json
{
  "success": true,
  "message": "Pedidos gerados com sucesso",
  "auctionId": "d9350256-...",
  "inserted": 3,
  "orders": [
    {
      "orderId": "b8a531ce-35a0-43b2-9721-a1e05f778912",
      "orderNumber": "B8A531CE",
      "phone": "5511999998888",
      "total": 240.0,
      "payment_link": "https://seviicolecionaveis.com.br/pay/b8a531ce-...",
      "order_link": "https://seviicolecionaveis.com.br/orders/b8a531ce-...",
      "user": { "login": "5511999998888@whatsapp.seviicolecionaveis.com.br", "password": "Ab3x...@1", "created": true },
      "items": [ { "product_name": "Charizard", "unit_price": 150.0, "quantity": 1 } ]
    }
  ]
}
```

- `orderNumber` = 8 primeiros caracteres do UUID em maiúsculas (mesmo padrão exibido no painel, ex.: `#B8A531CE`).
- Se algum arrematante falhar, vem `success: false` + array `errors: [{ phone, error }]`, e os demais pedidos continuam válidos.
- Erros: `401` sem `x-bot-secret` · `403` segredo errado · `400` JSON/`auctionId` inválido · `404` leilão inexistente · `500` erro de banco.

---

## 3. O que o painel faz ao receber o payload

1. Registra cada lance em `auction_bids` com `status = "approved"`.
2. Marca o vencedor de cada lote em `auction_items` (`winner_phone`, `winner_name`, `final_bid`, `status = "sold"`).
3. Fecha o leilão: `auctions.status = "finished"` + `closed_at`.
4. **Agrupa por telefone** e cria **um pedido por arrematante**:
   - localiza o cliente por `profiles.phone`/`whatsapp`; se não existir, cria conta + perfil;
   - `orders`: `status = "pending"`, `origin = "auction"`, `auction_id`, `payment_method = "pix"`, `shipping_method = "arrange"`, endereço "A combinar" (o cliente completa no painel), `subtotal = total = soma dos lances`;
   - `order_items`: um por lote (`card_id = "auction:<item_id>"`, nome, imagem do lote, quantidade, valor arrematado).
5. Atualiza os lances para `status = "order_created"` com `order_id` preenchido.

Novos campos no banco: `orders.origin` (`site` | `auction`) e `orders.auction_id`.

---

## 4. O que o bot deve fazer

1. Chamar o endpoint **uma única vez** por leilão no encerramento (a rota não é idempotente: chamar duas vezes cria pedidos duplicados).
2. Enviar PV a cada arrematante com `orderNumber`, `total`, `items` e o `payment_link`.
3. Quando `user.password` vier preenchido, informar login e senha temporária; quando não vier, dizer que a conta já existe e indicar "Esqueci minha senha".
4. `GET /api/public/bot/bids/approved` continua disponível e agora devolve `order_number` real assim que o pedido é criado.

---

## 5. Pendência única

Publicar a versão de produção do painel (`https://seviicolecionaveis.com.br`) — o preview já responde com o novo contrato.
