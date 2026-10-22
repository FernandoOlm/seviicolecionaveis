# 010 — Instruções de Implementação para o Lovable: Leilão por Blocos, Cadência e Transições

> **Como usar:** Copie todo o bloco da **Seção 1 (Prompt Pronto)** e cole diretamente no chat do Lovable. As seções seguintes trazem todos os detalhes de arquitetura, código e SQL para consulta.

---

## 1. 📋 PROMPT PRONTO PARA COLAR NO LOVABLE

Copie e cole o texto abaixo no chat do Lovable:

```markdown
Por favor, atualize o sistema de Leilões no painel administrativo com suporte a cadastro de leilão por BLOCOS, cadência configurável de envio e ações de transição entre blocos, conforme as regras abaixo:

### 1. Banco de Dados (Supabase)
Execute a migration ou adicione as seguintes colunas:
1. Na tabela `auction_items`:
   - `block_number`: INTEGER, NOT NULL, DEFAULT 1.
2. Na tabela `auctions`:
   - `item_delay_seconds`: INTEGER, NOT NULL, DEFAULT 3 (tempo em segundos entre o disparo de cada carta/lote).
   - `block_delay_seconds`: INTEGER, NOT NULL, DEFAULT 30 (tempo de intervalo/respiro em segundos entre o final de um bloco e o início do próximo).
   - `block_actions`: JSONB, NOT NULL, DEFAULT '[]'::jsonb (lista de mensagens e comandos WhatsApp a serem disparados após cada bloco).
3. Índice de ordenação:
   - `CREATE INDEX IF NOT EXISTS auction_items_block_seq_idx ON public.auction_items(auction_id, block_number, sequence);`

---

### 2. Tela de Cadastro de Leilão (`src/routes/admin.criar-leilao.tsx`)
1. **Cadência de Envio (Novos Campos):**
   - Adicionar seção "Cadência e Tempo de Envio (Bot)":
     - Campo numérico: "Tempo de envio entre cada lote (segundos)" (default 3, min 1, max 60).
     - Campo numérico: "Pausa de intervalo entre blocos (segundos)" (default 30, min 0, max 300).
2. **Organização Visual dos Lotes por Blocos:**
   - Cada carta (lote) pertence a um Bloco (Bloco 1, Bloco 2, Bloco 3...).
   - A interface deve exibir os lotes agrupados por bloco (ex: Bloco 1 com suas cartas; Bloco 2 com suas cartas; etc.).
   - Botão "+ Novo Bloco" que adiciona um novo bloco.
   - Botão "Adicionar Carta no Bloco X" dentro de cada bloco.
   - Em cada lote: seletor de bloco (permite mudar a carta de bloco), botões para subir/descer na ordem e excluir.
3. **Transições entre Blocos (Mensagens e Comandos):**
   - Para cada bloco (ex: após o Bloco 1, após o Bloco 2...), permitir cadastrar ações pós-bloco:
     - Tipo: "Mensagem de Texto" ou "Comando WhatsApp (!)".
     - Campo de texto: se for mensagem, o texto a ser enviado (ex: "Preparem-se para o Bloco 2!"); se for comando, o comando a ser executado no grupo (ex: "!all Atenção!", "!fechar-grupo", "!abrir-grupo").
     - Botão para adicionar e remover ações pós-bloco.
4. **Planilha Excel (Importação e Exportação):**
   - No template baixado (`modelo-lotes-leilao.xlsx`), incluir a coluna `bloco` no cabeçalho.
   - Na importação de planilha, ler a coluna `bloco` (se vazia, padrão 1) e atribuir o lote ao bloco correspondente.
5. **Salvamento (`save`):**
   - Salvar em `auctions`: `item_delay_seconds`, `block_delay_seconds`, `block_actions`.
   - Salvar em `auction_items`: `block_number` (número do bloco de cada lote).

---

### 3. Endpoints da API do Bot
1. `src/routes/api/public/bot/schedules/pending.ts`:
   - Na query de `auctions`: incluir `item_delay_seconds, block_delay_seconds, block_actions`.
   - Na query de `auction_items`: incluir `block_number` e ordenar por `block_number` e `sequence`.
   - No retorno de cada schedule, anexar `item_delay_seconds`, `block_delay_seconds` e `block_actions`.
2. `src/routes/api/public/bot/auctions/$id.ts`:
   - Ordenar `items` por `block_number` ascendente e `sequence` ascendente.
   - Retornar `block_actions: auction.block_actions || []` tanto na raiz quanto dentro de `auction`.
```

---

## 2. 🗄️ Script SQL Completo (Supabase Migration)

Execute no **SQL Editor** do Supabase ([zuypkggpecsqormwculg](https://supabase.com/dashboard/project/zuypkggpecsqormwculg)):

```sql
-- Migration: Suporte a Blocos de Leilão, Intervalo Configurável de Lotes e Ações de Transição
ALTER TABLE public.auction_items
  ADD COLUMN IF NOT EXISTS block_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.auctions
  ADD COLUMN IF NOT EXISTS item_delay_seconds INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS block_delay_seconds INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS block_actions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Índice para ordenação por bloco e sequência
CREATE INDEX IF NOT EXISTS auction_items_block_seq_idx 
  ON public.auction_items(auction_id, block_number, sequence);
```

---

## 3. 📦 Estrutura dos Dados e Payload JSON

### Exemplo de `block_actions` salvo na tabela `auctions`:
```json
[
  {
    "id": "c7a82b3a-9e12-4f67-88ab-112233445566",
    "after_block": 1,
    "type": "message",
    "content": "📢 Fim do Bloco 1! A seguir, cartas raras do Bloco 2!",
    "sort_order": 1
  },
  {
    "id": "e8b93c4d-0f23-5a78-99bc-223344556677",
    "after_block": 1,
    "type": "command",
    "content": "!all Atenção para os lotes do Bloco 2!",
    "sort_order": 2
  },
  {
    "id": "f9ca4d5e-1a34-6b89-00cd-334455667788",
    "after_block": 2,
    "type": "command",
    "content": "!fechar-grupo",
    "sort_order": 1
  }
]
```

### Exemplo de resposta de `GET /api/public/bot/auctions/:id`:
```json
{
  "auction": {
    "id": "d9350256-a49b-46cc-b1a1-1cd7d7d71b89",
    "title": "Leilão de Pokémon por Blocos",
    "item_delay_seconds": 3,
    "block_delay_seconds": 30,
    "block_actions": [
      {
        "id": "act_1",
        "after_block": 1,
        "type": "message",
        "content": "📢 Fim do Bloco 1!",
        "sort_order": 1
      },
      {
        "id": "act_2",
        "after_block": 1,
        "type": "command",
        "content": "!all Atenção ao Bloco 2!",
        "sort_order": 2
      }
    ],
    "items": [
      { "id": "1", "name": "Carta 1", "block_number": 1, "sequence": 1, "starting_price": 10 },
      { "id": "2", "name": "Carta 2", "block_number": 1, "sequence": 2, "starting_price": 15 },
      { "id": "3", "name": "Carta 3", "block_number": 1, "sequence": 3, "starting_price": 20 },
      { "id": "4", "name": "Carta 4", "block_number": 2, "sequence": 4, "starting_price": 30 },
      { "id": "5", "name": "Carta 5", "block_number": 2, "sequence": 5, "starting_price": 40 },
      { "id": "6", "name": "Carta 6", "block_number": 2, "sequence": 6, "starting_price": 50 },
      { "id": "7", "name": "Carta 7", "block_number": 3, "sequence": 7, "starting_price": 100 }
    ]
  },
  "items": [ ... ],
  "block_actions": [ ... ]
}
```

---

## 4. 🤖 Status do Bot WhatsApp (`bot_seviicolecionaveis`)
- O Bot WhatsApp já foi atualizado e colocado em produção na VPS (`35.255.126.132`).
- Ele já está preparado para ler e processar 100% dessa estrutura:
  - Respeita o `item_delay_seconds` entre o disparo de cada carta.
  - Respeita o `block_delay_seconds` entre blocos.
  - Executa as mensagens e os comandos WhatsApp cadastrados em `block_actions` exatamente após o término de cada bloco.
