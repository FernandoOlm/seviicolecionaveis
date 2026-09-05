# 📋 [BUG] #004: Integração Externa (Lovable / Supabase / WUZAPI)

> **Status:** 🟡 AGUARDANDO_RETORNO_LOVABLE
> **Data:** 2026-09-04T18:56:36.823Z
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
  "updated_at": "2026-09-04T18:56:36.820Z"
}
```

---

## 3. Resumo do que Responder para Concluir Aqui:
1. Confirmação de criação/atualização da rota `/api/public/bot/groups/upsert` no Lovable.
2. Confirmação de testes com o segredo do bot (`x-bot-secret`).
3. Assim que confirmado, o status deste documento passará para **CONCLUIDO**.

---
*Documento gerado automaticamente pelo Dev (FixerAgent) do Antigravity em doc-agentes/.*
