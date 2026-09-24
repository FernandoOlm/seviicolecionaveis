# 006 - Registro de Alinhamento de Contrato de Leilão entre Painel Lovable e Bot WhatsApp

## 📌 Contexto
- **Data:** 09/09/2026
- **Status:** CONCLUÍDO
- **Origem da Notificação:** Bot de Leilões (`bot_seviicolecionaveis`)
- **Classificação:** BUG RESOLVIDO (Compatibilidade de API/Payload)

---

## 🔍 Descrição da Ocorrência
Ao despachar um leilão cadastrado no Painel Lovable ("Leilão teste", ID `d9350256-a49b-46cc-b1a1-1cd7d7d71b89`), o bot WhatsApp iniciou o processo no grupo de teste (`120363431037710322@g.us`), fechou o grupo para anúncios, renomeou e enviou a mensagem de abertura, porém parou subitamente sem disparar os lotes.

### Análise de Contrato:
A API pública de leilões exposta pelo Lovable/Supabase (`GET /api/public/bot/auctions/:id`) entrega o objeto formatado como:
```json
{
  "auction": {
    "id": "d9350256-a49b-46cc-b1a1-1cd7d7d71b89",
    "title": "Leilão teste",
    "status": "live",
    "items": [
      {
        "id": "c1df08b5-cb5a-4c1f-b2dc-6d2067cb16a6",
        "name": "Pokemon Charizard",
        "starting_price": 1,
        "bid_increment": 2,
        "buyout_price": 5,
        "extra_prices": [
          { "label": "Inc. 2", "value": 3 },
          { "label": "Inc. 3", "value": 4 }
        ]
      }
    ]
  }
}
```

O bot aguardava `data.items` na raiz do JSON (`const { items } = data`), o que resultava em `items === undefined` e quebrava na chamada `items.map()`.

---

## 🛠️ Resolução Aplicada no Bot
1. O bot agora aceita tanto `data.items` na raiz quanto `data.auction.items` aninhado.
2. Mapeamento dos campos do Supabase (`starting_price`, `bid_increment`, `buyout_price`, `extra_prices`) implementado com resiliência a valores nulos.
3. Adicionado fail-safe que destrava o grupo caso ocorra qualquer erro de conexão ou lista de lotes vazia.
4. Comando `!liberar-leilao` atualizado para destravar filas do Hub no WhatsApp.

Nenhuma alteração de frontend no Lovable foi necessária, mantendo total estabilidade do painel e do backend Supabase.
