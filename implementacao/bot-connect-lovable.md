# Integração Painel Sevii Colecionáveis ↔ `bot_seviicolecionaveis`

Documento de referência para o bot/Antigravity conectar-se ao painel.

---

## 1. Identidade (isolamento multi-bot)

| Parâmetro | Valor |
|---|---|
| `PROCESS_NAME` / `PM2_PROCESS_NAME` | `bot_seviicolecionaveis` |
| `BOT_API_SECRET` | `<BOT_API_SECRET>` |
| Porta API bot (VPS) | `3025` |
| Porta health (VPS) | `3026` |
| Porta comandos (VPS) | `3075` |
| WUZAPI user / webhook | `bot_seviicolecionaveis` · `http://127.0.0.1:3025/webhook/wuzapi` |
| Supabase project | `zuypkggpecsqormwculg` |

**Base URL do painel (produção):** `https://seviicolecionaveis.lovable.app`
(domínios próprios: `https://www.seviicolecionaveis.com.br`, `https://seviicolecionaveis.com.br`)
Preview/dev: `https://project--392637a4-5b2d-43f0-a643-ac0dba0c2366-dev.lovable.app`

Todas as chamadas devem enviar:

```
x-bot-secret: <BOT_API_SECRET>
Content-Type: application/json
```

Respostas de erro de autenticação: `401` (sem header), `403` (segredo errado),
`400` (`process_name` diferente de `bot_seviicolecionaveis`).
Detalhamento completo na **seção 7 (Erros do bot)**.

---

## 2. Tabelas criadas no Supabase (schema `public`)

| Tabela | Finalidade |
|---|---|
| `bot_instances` | `process_name` (único), `status`, `qr_code_base64`, `bot_number`, `command`, `updated_at` |
| `bot_groups` | `group_jid` (único), `group_name`, `group_type`, `status`, `activated_at` |
| `activation_codes` | `code` (10 dígitos, único), `group_name`, `group_type`, `is_used`, `used_by_jid`, `expires_at` |
| `bot_command_queue` | `command`, `target_group`, `target_bot`, `args` (jsonb), `status`, timestamps |

RLS habilitada: apenas administradores do painel leem/escrevem via app; o bot
acessa exclusivamente pelos endpoints HTTP abaixo (service role no servidor).
Realtime ativado para `bot_instances` e `bot_command_queue`.

Valores de `status` em `bot_instances`: `STARTING`, `AWAITING_SCAN`, `CONNECTED`, `DISCONNECTED`.

---

## 3. Endpoints

### 3.1 `POST /api/public/bot/status`
Upsert do estado da instância (por `process_name`).

```json
{
  "process_name": "bot_seviicolecionaveis",
  "status": "AWAITING_SCAN",
  "qr_code_base64": "data:image/png;base64,...",
  "bot_number": "55XXXXXXXXXXX"
}
```
Resposta: `200 { "success": true, "instance": { ... } }`

Notas:
- Quando `status = "CONNECTED"`, o painel limpa automaticamente `qr_code_base64` e `command`.
- Envie `"clear_command": true` para confirmar que consumiu um `RESET_AUTH`.

### 3.2 `GET /api/public/bot/status`
Retorna a instância atual — útil para o bot fazer polling do campo `command`
(`RESET_AUTH`) caso não use Realtime.

```json
{ "process_name": "bot_seviicolecionaveis", "instance": { "status": "CONNECTED", "command": null } }
```

### 3.3 `DELETE /api/public/bot/status?process_name=bot_seviicolecionaveis`
Remove a instância (limpeza de órfãos). `200 { "success": true }`

### 3.4 `GET /api/public/bot/groups/active`
Trava de segurança: o bot só deve responder nesses JIDs.

```json
{
  "now": "2026-09-03T18:00:00.000Z",
  "process_name": "bot_seviicolecionaveis",
  "count": 1,
  "jids": ["120363XXXXXXXXXX@g.us"],
  "groups": [{ "jid": "120363XXXXXXXXXX@g.us", "name": "Sevii Leilões", "group_type": "principal" }]
}
```

### 3.5 `POST /api/public/bot/groups/activate`
Chamado quando alguém digita `!ativar <codigo>` no grupo.

```json
{ "code": "7483920194", "group_jid": "120363XXXXXXXXXX@g.us", "group_name": "Sevii Leilões" }
```
- `200 { "success": true, "message": "Grupo ativado com sucesso!" }`
- `400 / 404 { "error": "Código inválido ou expirado" }`

O código é marcado como usado e o grupo entra em `bot_groups` com `status = active`.



### 3.5b `POST /api/public/bot/groups/upsert` (aliases: `/groups/sync`, `POST /groups`)
Sincroniza a lista de grupos que o bot enxerga no WhatsApp.

```json
{
  "process_name": "bot_seviicolecionaveis",
  "groups": [
    { "jid": "120363XXXXXXXXXX@g.us", "name": "Sevii Leilões" }
  ]
}
```
Aceita também `group_jid`/`group_name`/`subject` e um array puro no corpo.
JIDs sem sufixo `@g.us` são ignorados.

- `200 { "success": true, "received": 12, "upserted": 10, "created": 3, "updated": 7, "active_jids": [...] }`
- `400 { "error": "JSON inválido" | "process_name inválido..." }`
- `401` sem header `x-bot-secret`

Grupos novos entram como `status = "pending"`; a ativação continua exclusivamente
por `!ativar <codigo>`. Grupos já ativos **não** são desativados por esta rota.



### 3.6 `GET /api/public/bot/commands/pending?process_name=bot_seviicolecionaveis&limit=20`
Retorna comandos `pending` cujo `target_bot` é `bot_seviicolecionaveis` ou `NULL`.

```json
{
  "commands": [
    { "id": "uuid", "command": "!ping", "target_group": "120363...@g.us", "args": {}, "created_at": "..." }
  ]
}
```

### 3.7 `POST /api/public/bot/commands/:id/mark`
```json
{ "action": "done" }
```
`action` ∈ `sending` | `done` | `error`. Resposta `200 { "success": true, "command": { ... } }`.

### 3.8 `POST /api/public/bot/users/senha`
Comando `!senha` no WhatsApp — cria o cliente ou redefine a senha.

```json
{ "phone": "554799999999", "name": "Nome Cliente" }
```
```json
{
  "userId": "uuid",
  "created": true,
  "login": "554799999999@whatsapp.seviicolecionaveis.com.br",
  "phone": "554799999999",
  "password": "senhaGeradaAleatoria@1",
  "resetUrl": "/reset-password"
}
```
O login é o e-mail técnico derivado do telefone; o perfil recebe `phone` e `whatsapp`.

---

## 4. Painel administrativo

`/admin/conectar-bot` (menu lateral → Sistema → **Conectar Bot**):

- Card da instância `bot_seviicolecionaveis` com status em tempo real (Realtime + polling 15s).
- Exibe o QR Code quando `AWAITING_SCAN`; badge verde e número quando `CONNECTED`.
- Botão **Reiniciar conexão / Gerar novo QR Code** → grava `command = 'RESET_AUTH'` e
  `status = 'STARTING'`. O bot deve detectar (Realtime ou `GET /status`), apagar a sessão
  local e emitir novo QR.
- Gerador de códigos de ativação de 10 dígitos (validade 24h) com nome e tipo do grupo.
- Lista de grupos ativados com botão ativar/desativar.

---

## 5. Fluxos recomendados no bot

1. **Boot:** `POST /status` com `STARTING`.
2. **QR gerado:** `POST /status` com `AWAITING_SCAN` + `qr_code_base64`.
3. **Conectado:** `POST /status` com `CONNECTED` + `bot_number`.
4. **Loop (a cada ~5s):** `GET /status` → se `command === "RESET_AUTH"`, limpar sessão,
   reiniciar e enviar `POST /status` com `clear_command: true`.
5. **Loop (a cada ~5s):** `GET /commands/pending` → `POST /commands/:id/mark` com
   `sending` e depois `done`/`error`.
6. **Cache de segurança (a cada ~60s):** `GET /groups/active` — ignorar mensagens de
   qualquer JID fora dessa lista.
7. **`!ativar <codigo>`:** `POST /groups/activate` e responder no grupo com a mensagem retornada.
8. **`!senha`:** `POST /users/senha` e enviar as credenciais em privado ao usuário.

## 6. Exemplo de chamada

O segredo nunca deve ficar em código/documento: leia de variável de ambiente
(`BOT_API_SECRET`) no processo do bot.

```bash
curl -X POST https://seviicolecionaveis.lovable.app/api/public/bot/status \
  -H "x-bot-secret: $BOT_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"process_name":"bot_seviicolecionaveis","status":"CONNECTED","bot_number":"5547999999999"}'
```

---

## 7. Erros do bot (troubleshooting)

Todos os endpoints respondem JSON no formato `{ "error": "mensagem" }` com o
status HTTP abaixo. O bot deve tratar cada faixa de forma diferente.

### 7.1 Erros de autenticação (todos os endpoints)

| Status | Corpo | Causa | O que o bot deve fazer |
|---|---|---|---|
| `401` | `{"error":"Unauthorized"}` | Header `x-bot-secret` ausente ou vazio | Corrigir a configuração; **não** repetir em loop |
| `403` | `{"error":"Forbidden"}` | Segredo diferente do `BOT_API_SECRET` do painel | Parar o polling e alertar o admin; o segredo foi rotacionado |
| `500` | `{"error":"Server misconfigured"}` | `BOT_API_SECRET` não configurado no servidor | Repetir com backoff longo (5 min) e avisar o admin |

### 7.2 Erros de validação (`400`)

| Endpoint | Corpo | Causa |
|---|---|---|
| qualquer com `process_name` | `process_name inválido. Esperado: bot_seviicolecionaveis` | Outro bot tentou usar o painel, ou typo no nome do processo |
| `POST /status` | `JSON inválido` | Body não é JSON ou `Content-Type` errado |
| `POST /status` | `status inválido` | Valor fora de `STARTING`, `AWAITING_SCAN`, `CONNECTED`, `DISCONNECTED` |
| `GET /commands/pending` | `process_name inválido` | Query string sem `process_name` correto |
| `POST /commands/:id/mark` | `action inválida` | `action` fora de `sending` / `done` / `error` |
| `POST /schedules/:id/mark` | `action inválida` | Idem para agendamentos de leilão |
| `POST /groups/activate` | `Código inválido ou expirado` | Código não tem 10 dígitos, já usado ou fora da validade de 24h |
| `POST /groups/activate` | `group_jid inválido` | JID vazio ou sem sufixo `@g.us` |
| `POST /users/senha` | `phone inválido` | Telefone sem DDI/DDD ou com caracteres não numéricos |
| `POST /bids/create` | `auctionId obrigatório` | Falta o id do leilão no corpo |
| `POST /bids/mark` | `auctionId ou bidIds obrigatório` | Nenhum critério informado |

`400` nunca deve ser reenviado igual: é erro de payload. Logar e descartar.

### 7.3 Não encontrado (`404`)

| Endpoint | Corpo | Causa |
|---|---|---|
| `POST /groups/activate` | `Código inválido ou expirado` | Código inexistente no banco |
| `POST /commands/:id/mark` | `Comando não encontrado` | Comando já removido ou id errado |
| `POST /schedules/:id/mark` | `Agendamento não encontrado` | Agendamento cancelado no painel |
| `GET /auctions/:id` | `Leilão não encontrado` | Leilão excluído ou id inválido |
| `POST /bids/create` | `Leilão não encontrado` | Lance enviado para leilão inexistente |

Em `404` o bot deve **remover o item da fila local** e seguir — não reprocessar.

### 7.4 Erros de servidor (`500`)

Corpo traz a mensagem original do banco. Causas típicas: indisponibilidade
momentânea do backend, violação de constraint (ex.: JID duplicado em
`bot_groups`) ou falha ao criar/atualizar usuário em `POST /users/senha`
(`Falha ao criar usuário`).

Política recomendada: retry com backoff exponencial (5s → 10s → 30s → 60s,
máx. 5 tentativas). Se persistir, marcar o comando como `error` via
`POST /commands/:id/mark` para o painel exibir a falha.

### 7.5 Erros de rede / fora do padrão

| Sintoma | Causa provável | Ação |
|---|---|---|
| HTML em vez de JSON | URL errada (rota fora de `/api/public/bot/...`) ou domínio de preview desatualizado | Conferir a base URL da seção 1 |
| `404` sem corpo JSON | Endpoint inexistente / typo no caminho | Conferir a seção 3 |
| Timeout | Deploy em andamento ou rede | Retry com backoff; não duplicar `POST /bids/create` sem confirmar |
| QR nunca aparece no painel | `qr_code_base64` enviado sem o prefixo `data:image/png;base64,` | Enviar a data URL completa |
| Painel preso em `STARTING` | `RESET_AUTH` consumido sem `clear_command: true` | Reenviar `POST /status` com `clear_command: true` |
| Bot responde em grupo não autorizado | Cache de `/groups/active` desatualizado | Revalidar a cada 60s e ignorar JIDs fora da lista |

### 7.6 Regra de idempotência

`POST /bids/create` e `POST /commands/:id/mark` podem ser reenviados após
timeout. Antes de repetir um lance, consultar `GET /auctions/:id` para
verificar se o lance já foi registrado — evita lance duplicado no leilão.

