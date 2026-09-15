# 008 - Feat & Fix: Disparo Imediato de Leilões e Estabilização WUZAPI no Painel

**Data:** 15/09/2026  
**Status:** IMPLEMENTADO & VALIDADO  
**Programa:** `seviicolecionaveis` (Painel Administrativo)  

---

## 1. Contexto e Motivação
Para que o painel administrativo e o bot operem em perfeita sintonia, foram implementados mecanismos de controle direto no painel para permitir aos operadores o disparo imediato de leilões (mesmo os previamente em rascunho ou agendados) e ampliada a tolerância das rotas de agendamento consumidas pelo bot.

## 2. Modificações Implementadas
1. **Endpoint de Marcação (`src/routes/api/public/bot/schedules/$id.mark.ts`):**
   - Whitelist de ações ampliada para aceitar `closing` sem retorno HTTP 400.
   - Normalização automática de aliases (`sent` -> `done`, `closed` -> `done`).
   - Ciclo de vida refletido na tabela `auctions` (status `live` em `START` e `finished` em `CLOSE`).
2. **Endpoint de Agendamentos Pendentes (`src/routes/api/public/bot/schedules/pending.ts`):**
   - Suporte a agendamentos com status `pending` e `scheduled`.
   - Inclusão dos campos de compatibilidade `due_at` e `send_at` espelhando `scheduled_time`.
   - Inclusão do campo `extra_prices` na seleção dos lotes (`auction_items`).
3. **Interface de Acompanhamento (`src/routes/admin.acompanhar-leilao.tsx`):**
   - Adicionado botão **"Iniciar Leilão Agora"** (`startNow`) para leilões que não estejam ao vivo ou finalizados.
   - A ação remove agendamentos pendentes prévios de `START` do mesmo leilão para prevenir duplicações e insere um agendamento imediato (`scheduled_time = now`).
4. **Listagem de Leilões (`src/routes/admin.leiloes-whatsapp.tsx`):**
   - Adicionado botão rápido **"Iniciar Agora"** em cada card de leilão em estado `draft` ou `scheduled`.

## 3. Validação
- Endpoints e componentes testados contra o fluxo do bot `bot_seviicolecionaveis`.
- Compatibilidade reversa mantida com esquemas antigos do Supabase.
