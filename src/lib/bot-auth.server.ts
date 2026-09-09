// Autenticação compartilhada dos endpoints /api/public/bot/*
// O bot deve enviar o header: x-bot-secret: <BOT_API_SECRET>
export const BOT_PROCESS_NAME = "bot_seviicolecionaveis";

export function verifyBotAuth(request: Request): Response | null {
  const expected = process.env["BOT_API_SECRET"];
  if (!expected) {
    return Response.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const provided =
    request.headers.get("x-bot-secret") ?? request.headers.get("X-Bot-Secret") ?? "";
  if (!provided) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (provided !== expected) return Response.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

/** Garante isolamento multi-bot: só aceita chamadas do processo desta loja. */
export function assertProcess(name: unknown): Response | null {
  if (typeof name !== "string" || name !== BOT_PROCESS_NAME) {
    return Response.json(
      { error: `process_name inválido. Esperado: ${BOT_PROCESS_NAME}` },
      { status: 400 },
    );
  }
  return null;
}
