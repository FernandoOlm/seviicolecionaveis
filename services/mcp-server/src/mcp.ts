import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tools } from './tools/index.js';
import { supabaseAdmin } from './supabase.js';
import { mcpResource, PUBLIC_URL } from './oauth.js';

export async function mcpRoutes(app: FastifyInstance) {
  const allowedOrigins = [
    PUBLIC_URL,
    'https://chatgpt.com',
    'https://chat.openai.com',
    'https://platform.openai.com',
    'https://codex.openai.com',
    'https://seviicolecionaveis.com.br',
    'https://tcgmind.com.br',
    'https://testefol.com.br',
  ];

  const getEffectiveOrigin = (req: FastifyRequest) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host && typeof host === 'string') {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      if (host.includes('tcgmind.com.br') || host.includes('testefol.com.br')) {
        return `${proto}://${host}`;
      }
    }
    return PUBLIC_URL;
  };

  for (const url of ['/api/mcp', '/mcp']) {
    app.route({
      method: ['GET', 'POST', 'OPTIONS'],
      url,
      onRequest: async (req: FastifyRequest, reply: FastifyReply) => {
        const orig = getEffectiveOrigin(req);
        reply.header('Cache-Control', 'no-store');
        reply.header('WWW-Authenticate', `Bearer resource_metadata="${orig}/.well-known/oauth-protected-resource/api/mcp"`);

        const origin = req.headers.origin;
        if (origin && typeof origin === 'string') {
          if (!allowedOrigins.includes(origin) && !origin.includes('localhost')) {
            return reply.status(403).send({ error: 'Origem não permitida.' });
          }
          reply.header('Access-Control-Allow-Origin', origin);
          reply.header('Access-Control-Allow-Credentials', 'true');
          reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Baggage, Sentry-Trace');
          reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }

        if (req.method === 'OPTIONS') {
          return reply.status(204).send();
        }

        // Validação do Bearer Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return reply.status(401).send({
            error: 'unauthorized',
            message: 'Token de autenticação não fornecido. Conecte sua conta de administrador do Sevii Colecionáveis.',
          });
        }

        const rawToken = authHeader.slice(7).trim();
        let decoded: any;
        try {
          decoded = app.jwt.verify(rawToken);
        } catch {
          return reply.status(401).send({
            error: 'invalid_token',
            message: 'Token de autenticação inválido ou expirado. Renove via refresh_token.',
          });
        }

        if (decoded?.purpose !== 'mcp-access') {
          return reply.status(401).send({ error: 'invalid_token', message: 'Token inadequado para acesso ao MCP.' });
        }

        // Validação em tempo real do perfil admin no Supabase
        const isSuperAdmin = decoded.email?.toLowerCase() === 'contato@seviicolecionaveis.com.br';
        if (!isSuperAdmin) {
          const { data: roleData } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', decoded.userId)
            .eq('role', 'admin')
            .maybeSingle();

          if (!roleData) {
            return reply.status(403).send({
              error: 'forbidden',
              message: 'Acesso negado: a conta conectada não possui permissões de administrador.',
            });
          }
        }

        (req as any).adminUser = {
          userId: decoded.userId,
          email: decoded.email,
        };
      },
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        if (req.method !== 'POST') {
          return reply.status(405).header('Allow', 'POST, OPTIONS').send({
            error: 'method_not_allowed',
            message: 'Este servidor MCP utiliza transporte Streamable HTTP sem estado. Envie requisições via POST.',
          });
        }

        const adminContext = (req as any).adminUser;
        const body: any = req.body;

        if (!body || typeof body !== 'object') {
          return reply.status(400).send({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: JSON inválido.' },
          });
        }

        const isBatch = Array.isArray(body);
        const messages = isBatch ? body : [body];
        const responses: any[] = [];

        for (const msg of messages) {
          if (!msg || typeof msg !== 'object') continue;
          const { id, method, params } = msg;

          // Notificações (sem ID)
          if (id === undefined || id === null) {
            continue;
          }

          try {
            switch (method) {
              case 'initialize': {
                responses.push({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                      tools: {
                        listChanged: false,
                      },
                    },
                    serverInfo: {
                      name: 'sevii-colecionaveis',
                      version: '1.1.0',
                    },
                    instructions:
                      'Servidor MCP oficial do Sevii Colecionáveis. Executa operações administrativas completas de catálogo, estoque, pedidos, clientes, cupons e leilões.',
                  },
                });
                break;
              }

              case 'tools/list': {
                responses.push({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    tools: tools.map((t) => ({
                      name: t.name,
                      title: t.title,
                      description: t.description,
                      inputSchema: t.inputSchema,
                      annotations: {
                        readOnlyHint: t.readOnly,
                        destructiveHint: t.destructive,
                        idempotentHint: t.idempotent,
                      },
                    })),
                  },
                });
                break;
              }

              case 'tools/call': {
                const toolName = params?.name;
                const toolArgs = params?.arguments ?? {};
                const tool = tools.find((t) => t.name === toolName);

                if (!tool) {
                  responses.push({
                    jsonrpc: '2.0',
                    id,
                    error: {
                      code: -32601,
                      message: `Ferramenta '${toolName}' não encontrada no catálogo do Sevii Colecionáveis.`,
                    },
                  });
                  break;
                }

                try {
                  const result = await tool.handler(toolArgs, adminContext);
                  responses.push({
                    jsonrpc: '2.0',
                    id,
                    result: {
                      content: [
                        {
                          type: 'text',
                          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                        },
                      ],
                    },
                  });
                } catch (toolErr: any) {
                  console.error(`[MCP Tool Error] ${toolName}:`, toolErr);
                  responses.push({
                    jsonrpc: '2.0',
                    id,
                    result: {
                      content: [
                        {
                          type: 'text',
                          text: `Erro ao executar ${toolName}: ${toolErr?.message || String(toolErr)}`,
                        },
                      ],
                      isError: true,
                    },
                  });
                }
                break;
              }

              case 'ping': {
                responses.push({
                  jsonrpc: '2.0',
                  id,
                  result: {},
                });
                break;
              }

              default: {
                responses.push({
                  jsonrpc: '2.0',
                  id,
                  error: {
                    code: -32601,
                    message: `Método MCP '${method}' não implementado.`,
                  },
                });
              }
            }
          } catch (err: any) {
            responses.push({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32603,
                message: `Erro interno no servidor: ${err?.message || String(err)}`,
              },
            });
          }
        }

        reply.header('Content-Type', 'application/json');
        return reply.status(200).send(isBatch ? responses : responses[0] ?? {});
      },
    });
  }
}
