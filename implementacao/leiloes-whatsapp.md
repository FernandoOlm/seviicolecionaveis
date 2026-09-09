# Integração: Leilões WhatsApp — Sevii Colecionáveis ↔ `bot_seviicolecionaveis`

## URLs

- Produção: `https://seviicolecionaveis.com.br` (ou `https://project--392637a4-5b2d-43f0-a643-ac0dba0c2366.lovable.app`)
- Preview: `https://project--392637a4-5b2d-43f0-a643-ac0dba0c2366-dev.lovable.app`

Todas as rotas exigem o header:

```
x-bot-secret: <BOT_API_SECRET>
Content-Type: application/json
```

## Tabelas criadas

- `auctions` — leilão (`auction_number`, `title`, `group_jid`, `status` = draft/scheduled/live/finished/cancelled, `scheduled_start`, `scheduled_end`, `closing_message`, `closed_at`)
- `auction_items` — lotes (`sequence`, `name`, `description`, `image_url`, `starting_price`, `bid_increment`, `buyout_price`, `quantity`, `winner_phone`, `winner_name`, `final_bid`, `status`)
- `auction_schedules` — disparos (`action` = START/CLOSE/REMINDER, `scheduled_time`, `group_jid`, `status` = pending/sending/done/error, `error_message`)
- `auction_bids` — lances (`sequence`, `item_name`, `phone`, `bidder_name`, `amount`, `status` = pending/approved/rejected/order_created, `order_id`, `announced`)

Todas com Realtime habilitado. Imagens dos lotes ficam no bucket público `card-images`, prefixo `leiloes/` (o bucket `auction-images` não pôde ser criado: a política do workspace bloqueia novos buckets públicos; o `card-images` já é público e serve o mesmo propósito).

## Endpoints

### `GET /api/public/bot/schedules/pending`
Retorna agendamentos `pending` com `scheduled_time <= now()`, já com o leilão e os lotes embutidos.

```json
{ "schedules": [ { "id": "...", "auction_id": "...", "action": "START", "group_jid": "...@g.us",
  "auction": { "auction_number": 1, "title": "...", "closing_message": "...",
    "items": [ { "id":"...", "sequence":1, "name":"...", "image_url":"...", "starting_price":50, "bid_increment":5, "buyout_price":null } ] } } ] }
```

### `POST /api/public/bot/schedules/:id/mark`
Body: `{ "action": "sending" | "done" | "error", "error": "opcional" }`.
Ao marcar `done`: `START` → leilão vira `live`; `CLOSE` → leilão vira `finished` (com `closed_at`).

### `GET /api/public/bot/auctions/:id`
Retorna `{ auction: { ...campos, items: [...], bids: [...] } }`.

### `POST /api/public/bot/bids/create`
```json
{ "auctionId": "uuid", "bids": [ { "phone": "5547992671477", "bidder_name": "Fulano", "item_name": "Pikachu", "sequence": 1, "amount": 75 } ] }
```
Insere os lances, define vencedor/`final_bid`/`status=sold` no lote (maior lance por lote) e marca o leilão como `finished`.

### `GET /api/public/bot/bids/approved[?auctionId=uuid]`
Compradores com lances `approved` e `announced = false`, agrupados por telefone:
```json
{ "buyers": [ { "auction_id":"...", "auction_number":1, "phone":"55...", "group_jid":"...@g.us",
  "order_number": null, "payment_link": null, "total": 75,
  "items": [ { "bid_id":"...", "item_name":"Pikachu", "amount":75 } ] } ] }
```
`payment_link` vem da chave `auction_payment_link` em `app_settings` (opcional). Enquanto não houver pedido gerado, `order_number` fica `null` — o bot deve enviar as instruções de pagamento com o total.

### `POST /api/public/bot/bids/mark`
Body: `{ "auctionId": "uuid", "phones": ["55..."] }` ou `{ "bidIds": ["uuid"] }` → marca `announced = true`.

## Painel administrativo

- `/admin/leiloes-whatsapp` — listagem com abas (Todos / Ao Vivo / Agendados / Concluídos), grupo, nº de lotes, horários, editar e excluir.
- `/admin/criar-leilao` (`?id=` para editar) — dados gerais, seleção do grupo ativo (`bot_groups`), horários, mensagem de encerramento, construtor de lotes com upload de foto e reordenação. "Salvar Rascunho" (`draft`) ou "Programar Leilão" (`scheduled` + agendamentos START/CLOSE).
- `/admin/acompanhar-leilao?id=` — cronômetro, status ao vivo, encerramento manual (insere `CLOSE` imediato), grid de lotes com histórico de lances em tempo real e painel pós-leilão com "Aprovar Todos os Arremates" (`status = approved`).

## Fluxo do bot

1. Poll `schedules/pending` a cada 60s → marcar `sending` → executar → marcar `done`/`error`.
2. Ao fechar, enviar os lances via `bids/create`.
3. Poll `bids/approved` → anunciar no grupo + PV → `bids/mark`.
