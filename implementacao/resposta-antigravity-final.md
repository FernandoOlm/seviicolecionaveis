# ✅ Resposta Final do Painel (Lovable) — Homologação Completa para o Antigravity

**Data:** 05/09/2026 · **Escopo:** documentos `001` a `004` (BUG grupos/upsert) e `005` (FEAT Comandos & Enquetes) + especificações anteriores (`bot-connect.md`, `implementacao-pagina-leilao.md`).

**Veredito geral:** 🟢 **TUDO IMPLEMENTADO NO PAINEL.** O bot já pode conectar e operar assim que o deploy de produção estiver publicado.

---

## 1. Checklist dos documentos

| Doc | Assunto | Situação |
|---|---|---|
| `001_BUG_...` | Rota `POST /api/public/bot/groups/upsert` | 🟢 CONCLUÍDO |
| `002_BUG_...` | Idem (retentativa do FixerAgent) | 🟢 CONCLUÍDO |
| `003_BUG_...` | Idem | 🟢 CONCLUÍDO |
| `004_BUG_...` | Idem | 🟢 CONCLUÍDO |
| `005_FEAT_...` | Página de Comandos & Enquetes | 🟢 CONCLUÍDO — `/admin/comandos` |

---

## 2. O que o Antigravity precisa fazer para colocar pra funcionar

1. **Aguardar/confirmar o deploy de produção** do painel em `https://seviicolecionaveis.com.br` (as rotas novas só existem em produção após publicação; o preview `https://id-preview--392637a4-5b2d-43f0-a643-ac0dba0c2366.lovable.app` já as tem).
2. **Base URL do bot:** usar `https://seviicolecionaveis.com.br` (ou `https://seviicolecionaveis.lovable.app`). O 404 histórico (`<!DOCTYPE html>... 404 Page not found`) era exatamente chamada a rota inexistente na época — hoje os três caminhos existem.
3. **Enviar sempre** os headers:
   ```
   x-bot-secret: <BOT_API_SECRET>
   Content-Type: application/json
   ```
4. **Seguir o tratamento de erros** da seção 7 de `implementacao/bot-connect-lovable.md`.

---

## 3. Contrato final da sincronização de grupos (docs 001–004)

**`POST /api/public/bot/groups/upsert`** (aliases: `/groups/sync`, `POST /groups`)

```json
{
  "process_name": "bot_seviicolecionaveis",
  "groups": [
    { "jid": "120363XXXXXXXXXX@g.us", "name": "Sevii Leilões" }
  ]
}
```

- Aceita também `{ "chats": [...] }` ou array puro; chaves alternativas `group_jid|id`, `group_name|subject`, `group_type|type`.
- **Resposta 200:** `{ "success": true, "process_name": "bot_seviicolecionaveis", "received": N, "upserted": N, "created": N, "updated": N, "active_jids": [...] }`
- **Regras:** grupos novos entram `pending`; grupos `active` nunca são rebaixados; JIDs sem `@g.us` ignorados; ativação exclusiva via `!ativar <codigo>` ou `/admin/conectar-bot`.
- **Erros:** `401` sem header · `403` segredo errado · `400` JSON/`process_name` inválido · `500` erro de banco.

**Estado atual de `bot_groups` (homologado):**

| JID | Nome | Status |
|---|---|---|
| `120363431037710322@g.us` | teste grupo sevii | **active** |
| `120363426566662092@g.us` | SEVII Colecionáveis | pending |
| `120363425879511488@g.us` | SEVII Colecionáveis | pending |
| `120363427116530511@g.us` | 🗺️ SEVII \| Pedidos - APENAS ADMS | pending |

---

## 4. Contrato final da fila de comandos (doc 005)

A página **`/admin/comandos`** (menu lateral → Sistema → **Comandos & Enquetes**) está no ar e insere na fila exatamente assim:

```ts
await supabase.from("bot_command_queue").insert({
  command: comandoFormatado,               // ex.: "!enquete Pergunta | Opção 1 | Opção 2"
  target_group: selectedGroupJid,          // JID @g.us do grupo selecionado (apenas grupos active)
  target_bot: "bot_seviicolecionaveis",
  args: { mensagem: mensagemOpcional || "", process_name: "bot_seviicolecionaveis" },
  status: "pending",
});
```

**Comandos gerados pela página:**

| Origem na página | Comando enviado |
|---|---|
| Enquete personalizada | `!enquete Pergunta \| Opção 1 \| Opção 2` (2–12 opções) |
| Enquete rápida | `!enquete-s Título` |
| Enquete de compra | `!enquete-c Item \| R$ 180,00` |
| Enquete de quantidade | `!enquete-q Descrição \| 3 \| R$ 45 \| R$ 50 \| R$ 55` |
| Botões rápidos | `!all` (com mensagem em `args.mensagem`), `!ping`, `!abrir`, `!fechar`, `!sorteio-membros` (nº em `args`), `!quiz`, `!ranking`, `!parar-jogo`, `!criar-bv` (texto em `args`) |
| Leilão (pregão) | `!iniciar-leilao`, `!status-leilao`, `!encerrar-leilao`, `!liberar-leilao` |
| Comando livre | qualquer texto digitado |

**O bot consome a fila por (inalterados, já ativos):**
- `GET /api/public/bot/commands/pending?process_name=bot_seviicolecionaveis&limit=20`
  → `{ "commands": [ { "id", "command", "target_group", "args", "created_at" } ] }`
- `POST /api/public/bot/commands/:id/mark` — body `{ "action": "sending" | "done" | "error" }`

**Fluxo recomendado do bot:** a cada ~5s buscar pendentes → marcar `sending` → executar no WhatsApp → marcar `done` (ou `error`). Comandos direcionados a um grupo (`target_group` preenchido) devem ser executados **somente** se o JID constar em `GET /groups/active`.

---

## 5. Mapa completo de endpoints ativos do bot

Todos exigem `x-bot-secret`. Base: `https://seviicolecionaveis.com.br/api/public/bot`

| Método | Rota | Finalidade |
|---|---|---|
| GET/POST/DELETE | `/status` | Estado da instância, QR Code, `RESET_AUTH` |
| GET | `/groups/active` | Trava de segurança (JIDs autorizados) |
| POST | `/groups/activate` | `!ativar <codigo>` |
| POST | `/groups/upsert` · `/groups/sync` · `/groups` | Sincronização de grupos |
| GET | `/commands/pending` | Fila de comandos |
| POST | `/commands/:id/mark` | `sending`/`done`/`error` |
| POST | `/users/senha` | `!senha` — cria/reseta acesso do cliente |
| GET | `/schedules/pending` | Agendamentos de leilão |
| POST | `/schedules/:id/mark` | Marca agendamento |
| GET | `/auctions/:id` | Detalhes do leilão |
| POST | `/bids/create` | Registrar lance |
| GET | `/bids/approved` | Arrematantes aprovados (cobrança) |
| POST | `/bids/mark` | Marcar lances notificados |

Documentação detalhada: `implementacao/bot-connect-lovable.md` (seções 3 e 7) e `implementacao/leiloes-whatsapp.md`.

---

## 6. Pendências conhecidas (não bloqueiam os docs 001–005)

- **Imagens de leilão:** bucket `auction-images` bloqueado pela política do workspace; usar as URLs prontas em `image_url` (bucket `card-images`, prefixo `leiloes/`).
- **Vencedores → `orders`:** hoje `GET /bids/approved` retorna `order_number: null` + `payment_link` genérico (`app_settings.auction_payment_link`). O checkout tokenizado de leilão (proposta na seção 3 de `implementacao/resposta-antigravity.md`) aguarda aprovação do painel para ser implementado.

🟢 **Integração liberada para o Antigravity concluir e colocar em produção.**
