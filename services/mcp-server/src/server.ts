import fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { oauthRoutes, PUBLIC_URL } from './oauth.js';
import { mcpRoutes } from './mcp.js';

dotenv.config();

const PORT = Number(process.env.PORT || 3006);
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'sevii-mcp-jwt-secret-2026-super-secure';

export function buildServer() {
  const app = fastify({
    logger: process.env.NODE_ENV === 'development',
    trustProxy: true,
  });

  // CORS
  app.register(cors, {
    origin: (origin, cb) => {
      // Permite origens locais, OpenAI e domínios da loja
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Cookies & JWT
  app.register(cookie);
  app.register(jwt, {
    secret: JWT_SECRET,
  });

  // Health check
  const healthHandler = async () => ({
    status: 'healthy',
    service: 'Sevii Colecionáveis MCP Server',
    version: '1.1.0',
    publicUrl: PUBLIC_URL,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Módulos OAuth e MCP
  app.register(oauthRoutes);
  app.register(mcpRoutes);

  return app;
}

async function start() {
  const app = buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n======================================================`);
    console.log(`🚀 SEVII COLECIONÁVEIS MCP SERVER ONLINE!`);
    console.log(`📡 Ouvindo em: http://${HOST}:${PORT}`);
    console.log(`🔒 Public URL: ${PUBLIC_URL}`);
    console.log(`🛠️ MCP Endpoint: ${PUBLIC_URL}/api/mcp`);
    console.log(`🔑 OAuth Authorize: ${PUBLIC_URL}/api/mcp/oauth/authorize`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Falha ao iniciar servidor MCP:', err);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  start();
}
