import { authenticateMcpRequest, getPublicOrigin, ADMIN_ONLY_ERROR } from "./oauth.server";
import { tools } from "./tools.server";

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Baggage, Sentry-Trace",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  const origin = getPublicOrigin(request);
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const authHeader = request.headers.get("authorization");
  const authResourceMeta = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`;

  // Autenticação prévia obrigatória
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: ADMIN_ONLY_ERROR,
      }),
      {
        status: 401,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "WWW-Authenticate": authResourceMeta,
        },
      },
    );
  }

  let adminContext: { userId: string; email: string | null };
  try {
    adminContext = await authenticateMcpRequest(request);
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "unauthorized",
        message: err?.message || ADMIN_ONLY_ERROR,
      }),
      {
        status: 401,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "WWW-Authenticate": authResourceMeta,
        },
      },
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed", message: "Utilize POST para requisições MCP Streamable HTTP." }),
      {
        status: 405,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          Allow: "POST, OPTIONS",
        },
      },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const isBatch = Array.isArray(body);
  const messages = isBatch ? body : [body];
  const responses: any[] = [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const { id, method, params } = msg;

    // Notificações (sem ID)
    if (id === undefined || id === null) {
      if (method === "notifications/initialized") {
        // Ignora ou registra conexão pronta
      }
      continue;
    }

    try {
      if (method === "initialize") {
        responses.push({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: "sevi-colecionaveis",
              version: "1.0.0",
            },
            instructions: "Você opera o Sevi Colecionáveis como um administrador autenticado. Consulte pedidos, estoque de cartas Pokémon e lacrados, crie cupons e atualize status com segurança.",
          },
        });
      } else if (method === "ping") {
        responses.push({
          jsonrpc: "2.0",
          id,
          result: {},
        });
      } else if (method === "tools/list") {
        responses.push({
          jsonrpc: "2.0",
          id,
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: {
                readOnlyHint: t.readOnly,
                openWorldHint: ["fazer_upload_imagem", "operar_leilao", "despachar_pilha", "atualizar_status_pedido", "vincular_arremate_pilha"].includes(t.name),
                destructiveHint: t.destructive,
                idempotentHint: t.idempotent,
              },
            })),
          },
        });
      } else if (method === "tools/call") {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const toolDef = tools.find((t) => t.name === toolName);

        if (!toolDef) {
          responses.push({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32601,
              message: `Ferramenta '${toolName}' não encontrada no catálogo.`,
            },
          });
          continue;
        }

        try {
          const result = await toolDef.handler(toolArgs, adminContext);
          responses.push({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
                },
              ],
              isError: false,
            },
          });
        } catch (toolErr: any) {
          responses.push({
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    sucesso: false,
                    erro: toolErr?.message || "Erro desconhecido na execução da ferramenta.",
                  }),
                },
              ],
              isError: true,
            },
          });
        }
      } else {
        responses.push({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Método '${method}' não suportado.`,
          },
        });
      }
    } catch (handlerErr: any) {
      responses.push({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: handlerErr?.message || "Erro interno no processamento MCP.",
        },
      });
    }
  }

  // Se foram apenas notificações, retorna 204
  if (responses.length === 0) {
    return new Response(null, { status: 204, headers: cors });
  }

  const payload = isBatch ? responses : responses[0];
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
