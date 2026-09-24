# 007 - Especificação Técnica: Recepção de Lances/Votos e Criação de Pedidos de Leilão no Painel Lovable

## 📌 Contexto & Objetivo
- **Data:** 09/09/2026
- **Status:** `AGUARDANDO_RETORNO_LOVABLE`
- **Origem:** Bot WhatsApp (`bot_seviicolecionaveis`) & Painel Web Lovable (`seviicolecionaveis`)
- **Objetivo:** Estabelecer o contrato de comunicação e as rotas de backend (Supabase Edge Functions / API routes) para:
  1. Computar votos/lances ao vivo ou no encerramento do leilão.
  2. Receber os dados consolidados do bot e criar os **Pedidos (`orders`)** e **Itens do Pedido (`order_items`)** para cada arrematante no Painel Lovable.
  3. Devolver os dados dos pedidos criados (ID do pedido, valor total e itens) para que o bot envie mensagem privada (PV) aos ganhadores com o link do painel.

---

## 🏗️ Fluxo Operacional da Integração

```text
[1. Usuários votam nas Enquetes no WhatsApp]
                    │
                    ▼
[2. Bot computa os votos/lances dos participantes]
    - Identifica o maior lance de cada lote
    - Mapeia o telefone real do arrematante (Phone Number E.164)
                    │
                    ▼
[3. Encerramento do Leilão (Agendamento / Manual)]
    - Bot chama o endpoint do Lovable:
      POST /api/public/bot/bids/create
                    │
                    ▼
[4. Lovable / Supabase processa e cria Pedidos]
    - Localiza ou cadastra o cliente pelo número de telefone (whatsapp)
    - Gera Pedido na tabela `orders` (status: pendente / aguardando_pagamento, origem: leilao)
    - Vincula os itens arrematados na tabela `order_items`
    - Retorna lista de pedidos criados com { phone, orderId, total, items, user }
                    │
                    ▼
[5. Bot envia PV aos Arrematantes com link do Painel e detalhes do Pedido]
```

---

## 📡 Especificação da Rota: Criação de Pedidos via Lances

### 1. Endpoint
- **Método:** `POST`
- **URL:** `https://seviicolecionaveis.com.br/api/public/bot/bids/create`
- **Autenticação:** Headers HTTP com segredo do bot:
  ```http
  x-bot-secret: <BOT_API_SECRET>
  x-bot-name: bot_seviicolecionaveis
  Content-Type: application/json
  ```

---

### 2. Payload Enviado pelo Bot (`Request Body`)

O bot consolida os resultados dos lances vencedores de cada lote do leilão e envia o payload estruturado:

```json
{
  "auctionId": "d9350256-a49b-46cc-b1a1-1cd7d7d71b89",
  "auctionNumber": 1,
  "bids": [
    {
      "phone": "5511999998888",
      "bidder_name": "Nome do Participante",
      "item_id": "c1df08b5-cb5a-4c1f-b2dc-6d2067cb16a6",
      "item_name": "Pokemon Charizard Base Set Holo",
      "amount": 150.00,
      "sequence": 1
    },
    {
      "phone": "5511999998888",
      "bidder_name": "Nome do Participante",
      "item_id": "a2bc34d5-ef6a-7b8c-9d0e-1f2a3b4c5d6e",
      "item_name": "Pokemon Blastoise Base Set Holo",
      "amount": 90.00,
      "sequence": 2
    },
    {
      "phone": "5521988887777",
      "bidder_name": "Outro Arrematante",
      "item_id": "f5e4d3c2-b1a0-9876-5432-10fedcba9876",
      "item_name": "Pokemon Venusaur",
      "amount": 75.00,
      "sequence": 3
    }
  ]
}
```

#### Detalhamento dos Campos do Payload:
| Campo | Tipo | Obrigatório | Descrição |
| :--- | :--- | :---: | :--- |
| `auctionId` | `UUID` | **Sim** | ID único do leilão no Supabase. |
| `auctionNumber` | `Number` | Não | Número sequencial do leilão (ex: #1). |
| `bids` | `Array` | **Sim** | Lista de lances vencedores de cada lote arrematado. |
| `bids[].phone` | `String` | **Sim** | Número do WhatsApp limpo (apenas dígitos, ex: `5511999998888`). |
| `bids[].bidder_name` | `String` | Não | Nome ou PushName do WhatsApp do participante. |
| `bids[].item_id` | `UUID` | Não | ID do item/lote no Supabase (se fornecido na criação do leilão). |
| `bids[].item_name` | `String` | **Sim** | Título/nome da carta ou produto arrematado. |
| `bids[].amount` | `Number` | **Sim** | Valor final do lance arrematado em Reais (R$). |
| `bids[].sequence` | `Number` | Não | Número do lote/ordem no leilão. |

---

### 3. Resposta Esperada pelo Bot (`Response 200 OK`)

O Lovable deve processar os lances, agrupar por comprador (`phone`), gerar o pedido no banco e responder com os dados dos pedidos gerados:

```json
{
  "success": true,
  "message": "Pedidos gerados com sucesso",
  "orders": [
    {
      "orderId": "b8a531ce-35a0-43b2-9721-a1e05f778912",
      "orderNumber": "1042",
      "phone": "5511999998888",
      "total": 240.00,
      "user": {
        "login": "5511999998888",
        "password": "tempPassword123"
      },
      "items": [
        {
          "product_name": "Pokemon Charizard Base Set Holo",
          "unit_price": 150.00,
          "quantity": 1
        },
        {
          "product_name": "Pokemon Blastoise Base Set Holo",
          "unit_price": 90.00,
          "quantity": 1
        }
      ]
    },
    {
      "orderId": "c71120de-99f1-4b11-a832-d3f44e112233",
      "orderNumber": "1043",
      "phone": "5521988887777",
      "total": 75.00,
      "user": {
        "login": "5521988887777"
      },
      "items": [
        {
          "product_name": "Pokemon Venusaur",
          "unit_price": 75.00,
          "quantity": 1
        }
      ]
    }
  ]
}
```

---

## 🗄️ Ações Necessárias no Lovable / Supabase

1. **Agrupamento por Comprador:**
   - Agrupar múltiplos lotes arrematados pelo mesmo número de telefone no mesmo leilão em um único pedido (`order`), somando o total.

2. **Identificação / Cadastro do Cliente:**
   - Buscar na tabela de perfis/clientes (`profiles` ou `customers`) pelo telefone.
   - Caso não exista, criar registro temporário com o telefone e nome informado para permitir o login e pagamento no painel.

3. **Inserção do Pedido (`orders` & `order_items`):**
   - Criar registro com `status: 'pending'` (ou `awaiting_payment`), `origin: 'auction'`, `auction_id: auctionId`.
   - Inserir cada lote correspondente em `order_items` com preço arrematado.

4. **Atualização do Status do Leilão:**
   - Atualizar a tabela de leilões (`auctions`) definindo o status para `'finished'` ou `'closed'`.

---

## ❓ Questionamentos para a Equipe Lovable

Para alinharmos 100% a comunicação entre o bot e o painel, favor responder os seguintes pontos:
1. Qual o nome exato das tabelas de pedidos no banco (`orders` e `order_items` ou outro formato)?
2. A criação do endpoint `/api/public/bot/bids/create` será feita via Supabase Edge Function ou rota de API no backend?
3. O painel gera credenciais de acesso automático para novos clientes criados a partir do leilão (ex: login/senha ou link direto de checkout)?
4. Há algum campo adicional desejado no payload enviado pelo bot (ex: ID da transação PIX pré-gerada, timestamps de cada voto)?

---

**Status deste Documento:** Salvo e aguardando resposta da equipe do Lovable. O Bot WhatsApp já está preparado e com fallback ativo para disparar o PV localmente caso a rota esteja em fase de deploy.

---

## ✅ STATUS: CONCLUÍDO (09/09/2026 — Painel Lovable)

Implementado. Contrato, respostas aos 4 questionamentos e instruções completas em `implementacao/007_RESPOSTA_computacao_lances_e_criacao_pedidos_leilao.md`.
