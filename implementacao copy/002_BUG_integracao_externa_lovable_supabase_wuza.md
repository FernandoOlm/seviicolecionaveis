# 📋 [BUG] #002: Integração Externa (Lovable / Supabase / WUZAPI)

> **Status:** 🟢 CONCLUIDO
> **Data:** 2026-09-04T15:14:52.319Z
> **Bot de Origem:** bot_seviicolecionaveis (Sevii Colecionáveis WhatsApp Bot)
> **Painel Lovable:** seviicolecionaveis

---

## 1. O que foi Implementado no Bot:
Implementação e configuração de integração preparadas no bot.

---

## 2. Ação Necessária no Painel Lovable:
Erro HTTP, timeout ou rejeição de credenciais em endpoints de API externa.

### Especificação Técnica da Rota / API:
- **Método HTTP:** `POST`
- **Caminho da Rota:** `/api/public/bot/groups/upsert`
- **Header Obrigatório:** `x-bot-secret: <BOT_API_SECRET>`
- **Payload Esperado (Exemplo):**
```json
{
  "status": "active",
  "updated_at": "2026-09-04T15:14:52.318Z"
}
```

---

## 3. Resumo do que Responder para Concluir Aqui:
1. Confirmação de criação/atualização da rota `/api/public/bot/groups/upsert` no Lovable.
2. Confirmação de testes com o segredo do bot (`x-bot-secret`).
3. Assim que confirmado, o status deste documento passará para **CONCLUIDO**.

---
*Documento gerado automaticamente pelo Dev (FixerAgent) do Antigravity em doc-agentes/.*

---

## 4. Retorno Recebido e Conclusão:
- **Data da Homologação:** 2026-09-05T22:58:00.000Z
- **Status Final:** 🟢 CONCLUIDO COM SUCESSO
- **Notas de Retorno do Lovable:**
  > A rota `POST /api/public/bot/groups/upsert` está implementada e ativa, junto com os aliases `POST /api/public/bot/groups/sync` e `POST /api/public/bot/groups`.
  > Autenticação obrigatória via header `x-bot-secret: <BOT_API_SECRET>` (401 sem header, 403 com segredo inválido).
  > Payload aceito: `{ "groups": [...] }`, `{ "chats": [...] }` ou array cru; chaves aceitas por item: `jid`/`group_jid`/`id` e `name`/`group_name`/`subject`. JIDs que não terminam em `@g.us` são ignorados.
  > Grupos novos entram como `pending` (precisam ser ativados em `/admin/conectar-bot` ou via `!ativar <codigo>`); grupos já `active` mantêm o status e apenas atualizam o nome.
  > Resposta de sucesso: `200` com o resumo do upsert.
- **Ação no Bot:** Integração liberada e operacional após deploy de produção do painel.

---

## 5. Detalhamento Técnico Final para o Antigravity:

**URL de produção:** `https://seviicolecionaveis.com.br/api/public/bot/groups/upsert`
(também aceita `https://seviicolecionaveis.lovable.app/...`; aliases equivalentes: `POST /api/public/bot/groups/sync` e `POST /api/public/bot/groups`)

**Exemplo de chamada:**
```bash
curl -X POST https://seviicolecionaveis.com.br/api/public/bot/groups/upsert \
  -H "x-bot-secret: $BOT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"process_name":"bot_seviicolecionaveis","groups":[{"jid":"120363XXXXXXXXXX@g.us","name":"Sevii Leilões"}]}'
```

**Resposta `200` (formato real):**
```json
{
  "success": true,
  "process_name": "bot_seviicolecionaveis",
  "received": 12,
  "upserted": 10,
  "created": 3,
  "updated": 7,
  "active_jids": ["120363XXXXXXXXXX@g.us"]
}
```

**Códigos de erro:** `401` sem header `x-bot-secret` · `403` segredo divergente · `400` JSON inválido ou `process_name` diferente de `bot_seviicolecionaveis` · `500` erro de banco (mensagem no corpo `error`).

**Regras de negócio confirmadas:**
- Grupos novos entram como `status = "pending"` — a ativação é exclusiva via `!ativar <codigo>` (`POST /api/public/bot/groups/activate`) ou pelo painel `/admin/conectar-bot`.
- Grupos já `active` nunca são rebaixados por esta rota; apenas `group_name`/`group_type`/`updated_at` são atualizados.
- JIDs sem sufixo `@g.us` são ignorados silenciosamente.
- A trava de segurança continua sendo `GET /api/public/bot/groups/active` (polling a cada ~60s): o bot só responde nos JIDs retornados em `jids`.

**Documentação completa:** `implementacao/bot-connect-lovable.md` (seção 3.5b) e consolidado em `implementacao/resposta-antigravity-final.md`.
