# Especificação de Integração: Painel Sevii Colecionáveis ↔ Bot WhatsApp (`bot_seviicolecionaveis`)

Este documento define **todas as diretrizes, tabelas de banco de dados, endpoints de API e interfaces** que o **Lovable** deve criar no projeto **Sevii Colecionáveis** (`https://zuypkggpecsqormwculg.supabase.co`) para conectar e controlar exclusivamente o bot WhatsApp **`bot_seviicolecionaveis`**.

---

## 1. Identidade e Regra de Isolamento Total (Anti-Conflito)

> [!IMPORTANT]
> **ISOLAMENTO MULTI-BOT OBRIGATÓRIO**
> No mesmo servidor/VPS coexistem outros projetos de clientes (`bot_lyf`, `black-flame-vault`, `bot_pokestation`).
> O painel **Sevii Colecionáveis** deve comunicar-se **exclusivamente** com a instância `bot_seviicolecionaveis`.
> Todas as chamadas do bot enviarão headers de identificação e autenticação.

| Parâmetro | Valor Exclusivo do Sevii Colecionáveis |
|---|---|
| **`PROCESS_NAME`** | `bot_seviicolecionaveis` |
| **`PM2_PROCESS_NAME`** | `bot_seviicolecionaveis` |
| **`BOT_API_SECRET`** | `<BOT_API_SECRET>` *(ou segredo configurado no painel)* |
| **Porta API Bot (VPS)** | `3025` |
| **Porta Health Bot (VPS)** | `3026` |
| **Porta Comandos Bot (VPS)**| `3075` |
| **WUZAPI User / Webhook** | `bot_seviicolecionaveis` · `http://127.0.0.1:3025/webhook/wuzapi` |
| **Supabase Project** | `zuypkggpecsqormwculg` (`https://zuypkggpecsqormwculg.supabase.co`) |

---

## 2. Tabelas no Supabase (Migrations Necessárias)

O Lovable deve garantir a existência das seguintes tabelas no schema `public`:

### 2.1 Tabela `bot_instances` (Status e QR Code)
```sql
CREATE TABLE IF NOT EXISTS public.bot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_name TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTING', -- STARTING, AWAITING_SCAN, CONNECTED, DISCONNECTED
  qr_code_base64 TEXT,
  bot_number TEXT,
  command TEXT, -- Usado para enviar 'RESET_AUTH'
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS e Realtime
ALTER TABLE public.bot_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total service_role bot_instances" ON public.bot_instances USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_instances;
```

### 2.2 Tabelas de Ativação de Grupos (`bot_groups` e `activation_codes`)
```sql
CREATE TABLE IF NOT EXISTS public.bot_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_jid TEXT UNIQUE NOT NULL,
  group_name TEXT,
  group_type TEXT DEFAULT 'principal', -- principal, teste, leilao
  status TEXT DEFAULT 'active', -- active, inactive
  activated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- Código numérico de 10 dígitos (ex: 7483920194)
  group_name TEXT,
  group_type TEXT DEFAULT 'principal',
  is_used BOOLEAN DEFAULT FALSE,
  used_by_jid TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.bot_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total service_role bot_groups" ON public.bot_groups USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total service_role activation_codes" ON public.activation_codes USING (true) WITH CHECK (true);
```

### 2.3 Tabela `bot_command_queue` (Fila de Comandos Remotos)
```sql
CREATE TABLE IF NOT EXISTS public.bot_command_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL,
  target_group TEXT,
  target_bot TEXT DEFAULT 'bot_seviicolecionaveis',
  args JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sending, done, error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.bot_command_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total service_role bot_command_queue" ON public.bot_command_queue USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_command_queue;
```

---

## 3. Endpoints de API que o Lovable Deve Implementar

Todas as rotas devem autenticar com o header `x-bot-secret: <BOT_API_SECRET>`.

### 3.1 `POST /api/public/bot/status` (Atualização de Status / QR Code)
- **Ação:** Upsert na tabela `bot_instances` pelo `process_name`.
- **Payload recebido:**
  ```json
  {
    "process_name": "bot_seviicolecionaveis",
    "status": "AWAITING_SCAN", // ou CONNECTED, DISCONNECTED, STARTING
    "qr_code_base64": "data:image/png;base64,...",
    "bot_number": "55XXXXXXXXXXX"
  }
  ```
- **Suporte a DELETE:** `DELETE /api/public/bot/status?process_name=...` para limpar instâncias órfãs.

### 3.2 `GET /api/public/bot/groups/active` (Trava de Segurança de Grupos)
- **Ação:** Retorna todos os JIDs de grupos ativos de Sevii Colecionáveis.
- **Resposta:**
  ```json
  {
    "now": "2026-09-03T18:00:00.000Z",
    "process_name": "bot_seviicolecionaveis",
    "count": 1,
    "jids": ["120363XXXXXXXXXX@g.us"],
    "groups": [
      { "jid": "120363XXXXXXXXXX@g.us", "name": "Sevii Leilões", "group_type": "principal" }
    ]
  }
  ```

### 3.3 `POST /api/public/bot/groups/activate` (Ativação por Código no WhatsApp)
- **Ação:** Chamado quando alguém digita `!ativar <codigo>` no grupo. Valida o código na tabela `activation_codes`, marca como usado e insere na `bot_groups`.
- **Payload recebido:**
  ```json
  { "code": "7483920194", "group_jid": "120363XXXXXXXXXX@g.us", "group_name": "Sevii Leilões" }
  ```
- **Resposta:** `200 { "success": true, "message": "Grupo ativado com sucesso!" }` ou `400/404 { "error": "Código inválido ou expirado" }`.

### 3.4 `GET /api/public/bot/commands/pending` (Consumo da Fila de Comandos)
- **Ação:** Retorna comandos com `status = 'pending'`, filtrando onde `target_bot = 'bot_seviicolecionaveis'` ou `target_bot IS NULL`.
- **Parâmetro:** `?process_name=bot_seviicolecionaveis&limit=20`.
- **Resposta:**
  ```json
  {
    "commands": [
      {
        "id": "uuid...",
        "command": "!ping",
        "target_group": "120363XXXXXXXXXX@g.us",
        "args": { "target_bot": "bot_seviicolecionaveis" }
      }
    ]
  }
  ```

### 3.5 `POST /api/public/bot/commands/:id/mark` (Conclusão do Comando)
- **Ação:** Atualiza o status do comando para `sending`, `done` ou `error`.
- **Payload:** `{ "action": "done" }`.

### 3.6 `POST /api/public/bot/users/senha` (Comando `!senha` no WhatsApp)
- **Ação:** Criação rápida de cliente ou redefinição de senha para o usuário do WhatsApp.
- **Payload:** `{ "phone": "554799999999", "name": "Nome Cliente" }`.
- **Resposta:**
  ```json
  {
    "userId": "uuid...",
    "created": true,
    "login": "554799999999",
    "password": "senhaGeradaAleatoria123@",
    "resetUrl": "/reset-password"
  }
  ```

---

## 4. Interfaces Administrativas que o Lovable Deve Criar

### 4.1 Tela `/admin/conectar-bot`
1. **Card da Instância:**
   - Exibir apenas a instância onde `process_name === 'bot_seviicolecionaveis'`.
   - Se `status === 'AWAITING_SCAN'`, exibir o `qr_code_base64` para o operador ler no WhatsApp.
   - Se `status === 'CONNECTED'`, exibir badge verde "🟢 Conectado" e o número `bot_number`.
   - Se `status === 'DISCONNECTED'` ou `STARTING`, exibir loader/aviso.
2. **Botão "Reiniciar Conexão / Gerar Novo QR Code":**
   - Atualiza `bot_instances` definindo `command = 'RESET_AUTH'`.
   - O bot detectará, apagará a sessão antiga na VPS e gerará um novo QR Code imediatamente.
3. **Gerador de Código de Ativação de Grupo:**
   - Botão para gerar um código numérico de 10 dígitos.
   - Instrução visual: *"Digite `!ativar <código>` no grupo do WhatsApp onde o bot deve atuar"*.
   - Lista dos grupos já ativados com opção de desativar.

---

## 5. Checklist do Que o Lovable Deve Informar / Responder

Ao concluir a implementação deste documento, o Lovable deve informar:
1. **URL Oficial Publicada do Painel** (ex: `https://seviicolecionaveis.lovable.app` ou domínio próprio).
2. **Valor do `BOT_API_SECRET`** configurado nas variáveis de ambiente do painel.
3. **Confirmação da criação das tabelas:** `bot_instances`, `bot_groups`, `activation_codes`, `bot_command_queue`.
4. **Confirmação dos endpoints criados e testados:**
   - `GET /api/public/bot/status`
   - `POST /api/public/bot/status`
   - `GET /api/public/bot/groups/active`
   - `POST /api/public/bot/groups/activate`
   - `GET /api/public/bot/commands/pending`
   - `POST /api/public/bot/users/senha`
