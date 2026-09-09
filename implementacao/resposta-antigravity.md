# Resposta do Painel (Lovable) — Sevii Colecionáveis

Data: 03/09/2026 · Avaliação de **todos** os documentos da pasta `implementacao/`.

| Documento | Situação |
|---|---|
| `bot-connect.md` (spec de conexão) | ✅ Implementado integralmente |
| `bot-connect-lovable.md` (referência do painel) | ✅ Atualizado (seções 3.5b e 7 incluídas) |
| `implementacao-pagina-leilao.md` (spec de leilões) | ✅ Implementado (1 desvio: bucket de imagens) |
| `leiloes-whatsapp.md` / `leiloes-whatsapp-m.md` | ✅ Documentação vigente (arquivos idênticos) |
| `resposta lovabe.md` | ℹ️ Resumo antigo; substituído por este arquivo |
| `ajuste-loavbe.md` (3 pedidos) | ✅ Itens 1 e 2 concluídos · item 3 respondido abaixo |

> ⚠️ **Segurança:** o `BOT_API_SECRET` estava escrito em texto puro em vários documentos.
> Todos foram substituídos por `<BOT_API_SECRET>`. Leia sempre de variável de ambiente.
> Se o valor circulou fora do time, peça a rotação do segredo no painel.

---

## 1. `POST /api/public/bot/groups/upsert` — CRIADO ✅

Existe agora, com três caminhos equivalentes (mesmo handler):

- `POST /api/public/bot/groups/upsert` (canônico)
- `POST /api/public/bot/groups/sync`
- `POST /api/public/bot/groups`

Header obrigatório: `x-bot-secret: <BOT_API_SECRET>` · `Content-Type: application/json`.

Aceita:
- `{ "process_name": "bot_seviicolecionaveis", "groups": [ { "jid": "...", "name": "..." } ] }`
- `{ "groups": [...] }`, `{ "chats": [...] }` ou um array puro no corpo
- Chaves alternativas por grupo: `jid|group_jid|id`, `name|group_name|subject`, `group_type|type`

Resposta `200`:
```json
{ "success": true, "received": 4, "upserted": 4, "created": 3, "updated": 1, "active_jids": ["...@g.us"] }
```

Regras aplicadas no banco (`bot_groups`, chave única `group_jid`):
- Atualiza `group_name`, `group_type` e `updated_at` sempre;
- Grupo novo entra como `status = "pending"`;
- **Grupo já `active` nunca é rebaixado** e um `pending` **não** vira `active` por aqui —
  a ativação continua sendo exclusivamente `!ativar <codigo>` (trava de segurança pedida
  na spec original: o bot só responde em JIDs de `GET /groups/active`);
- JIDs sem sufixo `@g.us` são ignorados silenciosamente.

Erros: `401` sem header · `403` segredo errado · `400` JSON inválido / `process_name` de outro bot.

## 2. Grupo de teste — CONFIRMADO ✅

O sync do bot já chegou. Estado atual de `bot_groups`:

| JID | Nome | Status |
|---|---|---|
| `120363431037710322@g.us` | teste grupo sevii | **active** |
| `120363426566662092@g.us` | SEVII Colecionáveis | pending |
| `120363425879511488@g.us` | SEVII Colecionáveis | pending |
| `120363427116530511@g.us` | 🗺️ SEVII \| Pedidos - APENAS ADMS | pending |

- `/admin/conectar-bot`: lista todos os grupos, com botão ativar/desativar.
- `/admin/criar-leilao`: o seletor de grupo lista **apenas `status = active`** — portanto
  o `teste grupo sevii` já é selecionável. Para usar os demais, ative-os no painel
  (ou via `!ativar <codigo>` no grupo).

## 3. Vencedores de leilão × tabela `orders` — situação e proposta

**Hoje:** `GET /api/public/bot/bids/approved` devolve `{ buyers: [...] }` agrupados por telefone,
com `items[]`, `total`, `order_number: null` e `payment_link` vindo da chave
`auction_payment_link` em `app_settings` (link genérico, opcional).

**Por que ainda não gera `orders`:** um pedido oficial exige usuário cadastrado
(`auth.users` + endereço), e do WhatsApp só temos telefone. Criar `orders` órfãos quebraria
estoque, pontos e e-mails transacionais.

**Proposta (a implementar quando você aprovar):**
1. Ao aprovar os arremates, o painel cria um **rascunho de pedido de leilão** com token
   público e gera `payment_link = https://seviicolecionaveis.com.br/leilao/checkout/<token>`.
2. Página pública desse token: mostra os lotes arrematados e o total, pede login ou cria
   a conta pelo telefone (mesmo fluxo já usado em `POST /bot/users/senha`), coleta endereço,
   calcula frete e paga via Pix/cartão (Mercado Pago, igual ao checkout atual).
3. Após pagamento: pedido vira `pago`/`aguardando_envio`, os lances passam a
   `status = order_created` com `order_id`, e o `order_number` real aparece em
   `bids/approved` para o bot anunciar.

Enquanto isso não estiver no ar, o bot deve enviar as instruções de pagamento com o
`total` e o `payment_link` genérico (se configurado).

---

## 4. Checklist da spec de leilões (`implementacao-pagina-leilao.md`)

1. Tabelas `auctions`, `auction_items`, `auction_schedules`, `auction_bids` — ✅ criadas,
   com RLS (admin no painel / service role nos endpoints), índices, triggers e Realtime.
   Extra: `auction_items.extra_prices` (jsonb) para até 7 faixas de valor por lote.
2. Bucket `auction-images` — ⚠️ **não criado**: a política do workspace bloqueia novos buckets
   públicos. As imagens usam o bucket público já existente **`card-images`, prefixo `leiloes/`**.
   URL final: `.../storage/v1/object/public/card-images/leiloes/<arquivo>`.
   O bot deve apenas consumir `image_url` como veio no payload.
3. Telas — ✅ `/admin/leiloes-whatsapp` (listagem/abas), `/admin/criar-leilao`
   (dados gerais + lotes + upload + import de planilha Excel/CSV + modelo para download)
   e `/admin/acompanhar-leilao?id=` (cronômetro, tempo real, encerrar manualmente,
   "Aprovar Todos os Arremates"). *Obs.:* `/admin/leiloes` continua sendo o leilão de pilha
   antigo; a listagem nova é `/admin/leiloes-whatsapp`.
4. Endpoints — ✅ `GET /schedules/pending`, `POST /schedules/:id/mark`, `GET /auctions/:id`,
   `POST /bids/create`, `GET /bids/approved`, `POST /bids/mark`.
5. URLs de produção — `https://seviicolecionaveis.lovable.app`,
   `https://seviicolecionaveis.com.br`; preview:
   `https://project--392637a4-5b2d-43f0-a643-ac0dba0c2366-dev.lovable.app`.

## 5. Checklist da spec de conexão (`bot-connect.md`)

✅ Isolamento multi-bot (`process_name` validado em todos os endpoints que o recebem),
`bot_instances` / `bot_groups` / `activation_codes` / `bot_command_queue`,
`/status` (GET/POST/DELETE), `/groups/active`, `/groups/activate`, `/groups/upsert`,
`/commands/pending`, `/commands/:id/mark`, `/users/senha`, tela `/admin/conectar-bot`
com QR em tempo real, `RESET_AUTH` e gerador de códigos de 10 dígitos (24h).

## 6. Pendência do lado do bot

- Se ainda aparecer `404` em `/groups/upsert`, confirme que está chamando o domínio de
  **produção** e que o deploy mais recente foi publicado.
- Consumir `GET /groups/active` a cada ~60s e ignorar JIDs fora da lista.
- Tratamento de erros: seguir a **seção 7** de `bot-connect-lovable.md`.
