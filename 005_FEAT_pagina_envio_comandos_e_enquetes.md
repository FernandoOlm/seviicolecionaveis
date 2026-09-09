# 📋 [FEATURE] #005: Página de Envio de Comandos e Enquetes de Grupo

> **Status:** 🟢 CONCLUIDO
> **Data:** 2026-09-05T22:42:00.000Z
> **Bot Alvo:** `bot_seviicolecionaveis` (Sevii Colecionáveis WhatsApp Bot)
> **Painel Lovable:** `seviicolecionaveis` (`https://seviicolecionaveis.lovable.app` / `https://seviicolecionaveis.com.br`)
> **Prioridade:** ALTA

---

## 1. Contexto e Justificativa

Atualmente o painel **Sevii Colecionáveis** possui a tela `/admin/conectar-bot` para pareamento de QR Code e ativação de grupos, e a tela `/admin/leiloes` para vincular arremates à pilha de compras.
No entanto, **não existe uma interface administrativa no painel para que o operador envie comandos diretamente aos grupos do WhatsApp e dispare enquetes interativas (polls)** de forma visual e intuitiva.

O bot na VPS já possui o serviço de polling contínuo da tabela `bot_command_queue` através dos endpoints:
- `GET /api/public/bot/commands/pending?process_name=bot_seviicolecionaveis&limit=20`
- `POST /api/public/bot/commands/:id/mark`

Portanto, é necessário criar no Lovable a tela **`/admin/comandos`** (ou **`/admin/painel-grupo`**) que permita ao operador gerenciar e despachar esses comandos e enquetes em tempo real.

---

## 2. Especificação da Rota e Navegação

1. **Caminho da Rota:** `/admin/comandos` (arquivo TanStack Router em `src/routes/_authenticated/admin.comandos.tsx` ou equivalente sob o layout de admin).
2. **Menu Lateral (Sidebar):**
   - Adicionar link na seção **Sistema** ou **Comunidade**:
   - Título: **Comandos & Enquetes**
   - Ícone: `Terminal`, `Send` ou `Vote` do `lucide-react`.
3. **Controle de Acesso:** Exclusivo para perfis com permissão administrativa (`admin` ou `operator`).

---

## 3. Estrutura e Funcionalidades da Página

A tela deve ser moderna, fluida (design padrão do Sevii com Tailwind/shadcn), organizada em blocos claros:

### 3.1 Cabeçalho e Seletor de Grupo de Trabalho
- **Título:** "Painel de Controle — Grupos & Enquetes"
- **Subtítulo:** "Envie comandos, gerencie leilões e dispare enquetes interativas nos grupos do WhatsApp."
- **Select Dropdown de Grupo:**
  - Consulta os grupos ativos na tabela `bot_groups` (`status = 'active'`).
  - Exibe o nome do grupo (`group_name`) e JID (`group_jid`).
  - Persiste a última escolha no `localStorage` sob a chave `"sevii.painel.grupo_selecionado"`.
  - Se nenhum grupo for selecionado, os botões de disparo devem ficar desabilitados exibindo aviso "Selecione um grupo primeiro".

---

### 3.2 Seção de Disparo de Enquetes Interativas (WhatsApp Polls)
Implementar uma área com **Abas (Tabs)** usando `Tabs, TabsList, TabsTrigger, TabsContent` para os 4 formatos de enquetes suportados:

#### 📊 Aba 1: Enquete Personalizada (Múltipla Escolha)
- **Campos:**
  - **Pergunta / Título da Enquete:** Input de texto (ex: `Qual o melhor dia para o próximo evento de Pokémon?`).
  - **Opções de Voto:** Lista dinâmica de inputs (mínimo 2, máximo 12 opções), com botões para adicionar opção (`+ Adicionar Opção`) e remover opção.
- **Ação do Botão "Disparar Enquete":**
  - Formata o comando no padrão: `!enquete Pergunta | Opção 1 | Opção 2 | Opção 3`
  - Enfileira na tabela `bot_command_queue`.

#### ⚡ Aba 2: Enquete Rápida (Sim / Não ou Quero / Passei)
- **Campos:**
  - **Título / Proposta:** Input de texto (ex: `Quem quer que abra mais uma Booster Box de 151 agora?`).
- **Ação do Botão "Enviar Enquete Rápida":**
  - Formata o comando: `!enquete-s Título da Proposta`
  - Enfileira na tabela `bot_command_queue`.

#### 🏷️ Aba 3: Enquete de Compra / Preço Fixo
- **Campos:**
  - **Nome do Item / Carta:** Input de texto (ex: `Charizard ex Shiny OBF #223`).
  - **Valor Fixo:** Input de texto ou moeda (ex: `R$ 180,00`).
- **Ação do Botão "Publicar Venda Fixa":**
  - Formata o comando: `!enquete-c Charizard ex Shiny OBF #223 | R$ 180,00`
  - Enfileira na tabela `bot_command_queue`.

#### 🔢 Aba 4: Enquete com Quantidade Múltipla
- **Campos:**
  - **Descrição:** Input de texto (ex: `Blister Triplo Escarlate e Violeta`).
  - **Quantidade de Unidades:** Input numérico (ex: `3`).
  - **Valores/Lances:** Lista de opções (ex: `R$ 45 | R$ 50 | R$ 55`).
- **Ação do Botão "Enviar Enquete com Quantidade":**
  - Formata o comando: `!enquete-q Blister Triplo Escarlate e Violeta | 3 | R$ 45 | R$ 50 | R$ 55`
  - Enfileira na tabela `bot_command_queue`.

---

### 3.3 Seção de Comandos Rápidos de Grupo (Grid de Cards/Botões)
Apresentar botões de ação rápida estilizados com ícones e tooltips:
- **`!all` (Marcar Todos):** Abre um modal para o operador digitar a mensagem de aviso (ex: `Atenção membros, leilão iniciando em 5 minutos!`) e dispara com menção a todos.
- **`!ping`:** Testa a resposta e latência do bot no grupo.
- **`!abrir`:** Abre o grupo para que todos os membros possam enviar mensagens.
- **`!fechar`:** Fecha o grupo para mensagens (apenas administradores).
- **`!sorteio-membros`:** Abre modal perguntando o número de ganhadores (ex: `3`) e sorteia entre os membros do grupo.
- **`!quiz`:** Inicia rodada de quiz Pokémon no grupo.
- **`!ranking`:** Publica a tabela de pontuação dos jogos no grupo.
- **`!parar-jogo`:** Interrompe qualquer jogo ativo no grupo.
- **`!criar-bv`:** Abre modal para configurar o texto de boas-vindas do grupo.

---

### 3.4 Seção de Gestão de Leilão (Pregão)
Botões dedicados para a condução do leilão em tempo real:
- **`!iniciar-leilao`:** Inicia a sessão oficial de leilão no grupo.
- **`!status-leilao`:** Exibe as parciais e lances computados até o momento.
- **`!encerrar-leilao`:** Encerra a sessão de leilão e despacha o relatório consolidado para o WhatsApp do administrador.
- **`!liberar-leilao`:** Força a limpeza e desbloqueio de sessões presas.

---

### 3.5 Seção de Comando Livre / Mensagem Direta
- Campo `Textarea` livre para digitar qualquer comando ou mensagem (ex: `!ajuda`, `Aviso importante: Envio dos pedidos amanhã às 14h`).
- Botão "Enviar Comando / Mensagem".

---

### 3.6 Monitor da Fila de Comandos (Histórico em Tempo Real)
Card com tabela exibindo os últimos 10 comandos enviados para a fila:
- **Colunas:**
  - **Comando:** Badge com o texto do comando disparado.
  - **Destino:** Nome do grupo ou JID.
  - **Status:**
    - `pending` (Amarelo / Loader) — Aguardando bot buscar.
    - `sending` (Azul) — Bot em processamento.
    - `done` (Verde) — Executado com sucesso no WhatsApp.
    - `error` (Vermelho) — Falha na execução.
  - **Data/Hora:** Horário do envio formatado (`HH:mm:ss`).
- **Atualização:** Supabase Realtime na tabela `bot_command_queue` ou polling com TanStack Query a cada 5 segundos.

---

## 4. Integração Técnica com a Fila (`bot_command_queue`)

Ao clicar em qualquer ação de envio, a aplicação deve inserir um registro na tabela `bot_command_queue`:

### Exemplo de Inserção:
```typescript
const { error } = await supabase.from("bot_command_queue").insert({
  command: comandoFormatado, // Ex: "!enquete Pikachu | R$ 10 | R$ 20" ou "!ping" ou "!all"
  target_group: selectedGroupJid, // Ex: "120363431037710322@g.us"
  target_bot: "bot_seviicolecionaveis",
  args: {
    mensagem: mensagemOpcional || "",
    process_name: "bot_seviicolecionaveis"
  },
  status: "pending"
});
```

> **Nota:** O bot `bot_seviicolecionaveis` já consulta ativamente os registros com `status = 'pending'` filtrando `target_bot = 'bot_seviicolecionaveis'`, executa a ação no WhatsApp do grupo e atualiza o status para `done` ou `error`.

---

## 5. Checklist do Que o Lovable Deve Retornar / Confirmar

Para concluir esta demanda com sucesso, o Lovable deve:
1. Confirmar a criação da página `/admin/comandos` (ou `/admin/painel-grupo`).
2. Confirmar a inclusão do botão/item no menu lateral de navegação.
3. Confirmar que os formulários de enquetes (`!enquete`, `!enquete-s`, `!enquete-c`, `!enquete-q`) e comandos rápidos estão inserindo corretamente na tabela `bot_command_queue`.
4. Informar quando a página estiver publicada e acessível.

---
*Documento elaborado pelo Antigravity em conformidade com os padrões arquiteturais de Sevii Colecionáveis.*

---

## 6. Retorno do Lovable (Homologação)

- **Data:** 2026-09-05T22:58:00.000Z
- **Status Final:** 🟢 CONCLUIDO

1. **Página criada:** `/admin/comandos` (arquivo `src/routes/admin.comandos.tsx`), restrita a administradores (`useAuth().isAdmin`).
2. **Menu lateral:** item **"Comandos & Enquetes"** (ícone `Terminal`) adicionado na seção **Sistema** de `src/components/admin/AdminSidebar.tsx`.
3. **Seletor de grupo:** lê `bot_groups` com `status = 'active'`, mostra `group_name` + `group_jid` e persiste a escolha em `localStorage` na chave `sevii.painel.grupo_selecionado`. Sem grupo selecionado, todos os botões ficam desabilitados com o aviso "Selecione um grupo primeiro".
4. **Enquetes (Tabs):**
   - Personalizada → `!enquete Pergunta | Opção 1 | Opção 2` (2 a 12 opções dinâmicas).
   - Rápida → `!enquete-s Título`.
   - Compra / preço fixo → `!enquete-c Item | R$ 180,00`.
   - Quantidade múltipla → `!enquete-q Descrição | 3 | R$ 45 | R$ 50 | R$ 55`.
5. **Comandos rápidos:** `!all` (modal de mensagem), `!ping`, `!abrir`, `!fechar`, `!sorteio-membros` (modal com nº de ganhadores), `!quiz`, `!ranking`, `!parar-jogo`, `!criar-bv` (modal de texto de boas-vindas).
6. **Leilão (pregão):** `!iniciar-leilao`, `!status-leilao`, `!encerrar-leilao`, `!liberar-leilao`.
7. **Comando livre:** textarea + botão para qualquer comando ou mensagem direta.
8. **Monitor da fila:** tabela com os 10 últimos registros de `bot_command_queue` filtrados por `target_bot = 'bot_seviicolecionaveis'`, com badge de comando, destino, status (`pending`/`sending`/`done`/`error`) e hora `HH:mm:ss`, com polling de 5 segundos.
9. **Inserção na fila** (exatamente como especificado):

```ts
await supabase.from("bot_command_queue").insert({
  command: comandoFormatado,
  target_group: selectedGroupJid,
  target_bot: "bot_seviicolecionaveis",
  args: { mensagem: mensagemOpcional || "", process_name: "bot_seviicolecionaveis" },
  status: "pending",
});
```

10. **Endpoints de polling do bot** continuam ativos e inalterados: `GET /api/public/bot/commands/pending?process_name=bot_seviicolecionaveis&limit=20` e `POST /api/public/bot/commands/:id/mark` (header `x-bot-secret`).

> **Observação:** a página fica disponível no preview imediatamente; em `https://seviicolecionaveis.com.br` após a publicação do projeto.

---

## 7. Guia Final para o Bot Colocar pra Funcionar:

1. **Deploy de produção:** a página `/admin/comandos` e todas as rotas já existem no código; em `https://seviicolecionaveis.com.br` ficam ativas após a publicação do projeto.
2. **Polling da fila (a cada ~5s):**
   - `GET https://seviicolecionaveis.com.br/api/public/bot/commands/pending?process_name=bot_seviicolecionaveis&limit=20`
   - Para cada comando: `POST /api/public/bot/commands/:id/mark` com `{ "action": "sending" }` → executar no WhatsApp → `{ "action": "done" }` (ou `"error"`).
3. **Filtro de grupo:** comandos com `target_group` preenchido só devem ser executados se o JID constar em `GET /api/public/bot/groups/active` (cache de ~60s).
4. **Formatos de comando que a página envia** (o parser do bot deve aceitar):
   - `!enquete Pergunta | Opção 1 | Opção 2` (2 a 12 opções)
   - `!enquete-s Título`
   - `!enquete-c Item | R$ 180,00`
   - `!enquete-q Descrição | 3 | R$ 45 | R$ 50 | R$ 55`
   - `!all` (mensagem em `args.mensagem`), `!ping`, `!abrir`, `!fechar`, `!sorteio-membros` (nº de ganhadores em `args`), `!quiz`, `!ranking`, `!parar-jogo`, `!criar-bv` (texto em `args`)
   - `!iniciar-leilao`, `!status-leilao`, `!encerrar-leilao`, `!liberar-leilao`
   - Qualquer comando/mensagem livre digitado pelo admin.
5. **Consolidado de homologação:** ver `implementacao/resposta-antigravity-final.md`.
