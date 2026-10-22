# 009 - Cadastro e Execução de Leilões por Blocos, Cadência Configurável e Ações de Transição

**Data:** 22/10/2026  
**Status:** IMPLEMENTADO & VALIDADO  
**Projetos Envolvidos:** `seviicolecionaveis` (Painel Web/Backend) e `bot_seviicolecionaveis` (Bot WhatsApp)  
**Workflow CodeCrew:** `WF-AC-20261022-296`  

---

## 1. Visão Geral e Requisitos Atendidos
1. **Conceito de Blocos e Lotes:**
   - **Lote:** Representa individualmente cada carta (dados, foto, valores e arremate).
   - **Bloco:** Agrupamento de um conjunto de cartas (ex: Carta 1, 2 e 3 no Bloco 1; Carta 4, 5 e 6 no Bloco 2; Carta 7 no Bloco 3).
2. **Cadência Configurável pelo Usuário:**
   - **Tempo de envio entre cada lote (segundos):** O operador configura o delay que o bot aguarda entre o disparo de uma carta e a próxima (padrão: 3 segundos).
   - **Pausa de intervalo entre blocos (segundos):** O operador configura o intervalo de respiro após a conclusão de um bloco antes do próximo (padrão: 30 segundos).
3. **Transições entre Blocos (Mensagens e Comandos):**
   - Possibilidade de cadastrar mensagens de texto e comandos de WhatsApp (ex: `!all Atenção!`, `!fechar-grupo`, `!abrir-grupo`) para serem disparados automaticamente após a conclusão de cada bloco.
4. **Importação e Exportação Excel:**
   - O modelo XLSX e o leitor de planilhas agora suportam nativamente a coluna `bloco`.
5. **Atendimento 100% no Bot WhatsApp:**
   - O bot despacha os lotes rigorosamente na ordem dos blocos e sequências, aplica os delays configurados e dispara mensagens e comandos de transição.

---

## 2. Arquivos Modificados / Criados

### 2.1 Painel Administrativo (`d:\Antigravity\seviicolecionaveis`)
- `supabase/migrations/20261022143000_auction_blocks_and_transitions.sql`:
  - `block_number` em `auction_items`.
  - `item_delay_seconds`, `block_delay_seconds`, `block_actions` em `auctions`.
  - Índice `auction_items_block_seq_idx`.
- `src/integrations/supabase/types.ts`:
  - Definições de tipos atualizadas para Rows, Inserts e Updates.
- `src/routes/api/public/bot/schedules/pending.ts`:
  - Retorno dos campos de bloco, ordenação por `block_number` e `sequence`.
- `src/routes/api/public/bot/auctions/$id.ts`:
  - Exposição de `items` ordenados por bloco e `block_actions`.
- `src/routes/admin.criar-leilao.tsx`:
  - Interface visual completa com agrupamento dinâmico por blocos, botão "+ Novo Bloco", controle de cadência de envio, cadastro inline de mensagens/comandos pós-bloco e importador/exportador XLSX com suporte a blocos.

### 2.2 Bot WhatsApp (`d:\Antigravity\bot_seviicolecionaveis`)
- `src/utils/hub-leilao.js`:
  - Agrupamento dos itens por `blockNumber`.
  - Aplicação de `itemDelayMs` configurado entre cartas.
  - Aplicação de `blockDelayMs` configurado entre blocos.
  - Execução de ações de transição (comandos `!all`, comandos administrativos emitidos para a esteira do bot e mensagens).
  - Trava de concorrência imediata em `auctionsRunning` para segurança.
- `tests/test_auction_blocks_and_cadence.test.js`:
  - Suíte com 4 testes cobrindo o cenário exato do usuário, validação estrutural de blocos, execução de comandos e resiliência a esquemas legados.

---

## 3. Validação e Qualidade
- **Suíte de Testes do Bot:** 4/4 testes aprovados com 100% de sucesso.
- **Build de Produção do Painel:** Compilado via Vite/Nitro com código de saída 0 sem erros de tipagem TypeScript.
