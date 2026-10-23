import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STORAGE_BUCKET = "card-images";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Validação rigorosa contra Server-Side Request Forgery (SSRF)
 * Rejeita esquemas não-HTTP(S), localhost, IPs privados, link-local (metadados de nuvem) e redes especiais.
 */
export function isAllowedPublicUrl(inputUrl: string): { allowed: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { allowed: false, reason: "URL inválida ou malformada" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "Protocolo inválido. Apenas HTTP e HTTPS são permitidos." };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // Bloqueio de localhost e nomes locais
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { allowed: false, reason: "Acesso a hosts locais não permitido (SSRF prevention)" };
  }

  // Checagem de endereço IP
  // IPv4 padrão: a.b.c.d
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipMatch = hostname.match(ipv4Regex);
  if (ipMatch) {
    const [, a, b, c, d] = ipMatch.map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return { allowed: false, reason: "Endereço IP inválido" };
    }

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return { allowed: false, reason: "IP Loopback não permitido" };

    // 10.0.0.0/8 (Privado)
    if (a === 10) return { allowed: false, reason: "IP Privado (10.x.x.x) não permitido" };

    // 172.16.0.0/12 (Privado 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) {
      return { allowed: false, reason: "IP Privado (172.16-31.x.x) não permitido" };
    }

    // 192.168.0.0/16 (Privado)
    if (a === 192 && b === 168) {
      return { allowed: false, reason: "IP Privado (192.168.x.x) não permitido" };
    }

    // 169.254.0.0/16 (Link-Local e Cloud Metadata: 169.254.169.254)
    if (a === 169 && b === 254) {
      return { allowed: false, reason: "IP Link-Local/Metadados de nuvem não permitido" };
    }

    // 0.0.0.0/8
    if (a === 0) return { allowed: false, reason: "IP Broadcast/Inseguro não permitido" };

    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (a === 100 && b >= 64 && b <= 127) {
      return { allowed: false, reason: "IP CGNAT não permitido" };
    }
  }

  // IPv6 checks
  if (hostname.includes(":") || hostname.startsWith("[") || hostname.endsWith("]")) {
    const cleanV6 = hostname.replace(/[\[\]]/g, "");
    if (
      cleanV6 === "::1" ||
      cleanV6 === "::" ||
      cleanV6.startsWith("fe80:") || // Link-local
      cleanV6.startsWith("fc00:") || // Unique local
      cleanV6.startsWith("fd00:")
    ) {
      return { allowed: false, reason: "IPv6 local/privado não permitido" };
    }
  }

  return { allowed: true };
}

/**
 * Detecta tipo MIME real e extensão a partir dos Magic Bytes do arquivo.
 */
export function detectImageMagicBytes(buffer: Uint8Array): { mimeType: string; extension: string } | null {
  if (buffer.length < 8) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }

  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mimeType: "image/gif", extension: "gif" };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }

  return null;
}

export interface UploadResult {
  publicUrl: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
}

/**
 * Faz upload do buffer de imagem no Supabase Storage (bucket "card-images").
 */
export async function uploadBufferToStorage(
  buffer: Uint8Array,
  fileNameHint?: string
): Promise<UploadResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Arquivo muito grande (${(buffer.length / (1024 * 1024)).toFixed(1)} MB). Limite máximo é 10 MB.`);
  }

  const detected = detectImageMagicBytes(buffer);
  if (!detected) {
    throw new Error("Formato de imagem não reconhecido ou corrompido. Formatos suportados: JPEG, PNG, WEBP, GIF.");
  }

  const uniqueId = crypto.randomUUID();
  const safePrefix = fileNameHint ? `${fileNameHint.replace(/[^a-zA-Z0-9_-]/g, "_")}_` : "";
  const storagePath = `${safePrefix}${uniqueId}.${detected.extension}`;

  const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: detected.mimeType,
    upsert: false,
    cacheControl: "31536000",
  });

  if (uploadError) {
    throw new Error(`Falha no upload para o armazenamento: ${uploadError.message}`);
  }

  const { data: urlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

  return {
    publicUrl: urlData.publicUrl,
    storagePath,
    fileSizeBytes: buffer.length,
    mimeType: detected.mimeType,
  };
}

/**
 * Processa imagem enviada em base64 (suporta data URL "data:image/png;base64,..." ou string pura).
 */
export async function uploadBase64Image(
  base64String: string,
  fileNameHint?: string
): Promise<UploadResult> {
  const cleanBase64 = base64String.replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/, "").trim();
  const binaryBuffer = Buffer.from(cleanBase64, "base64");

  if (binaryBuffer.length === 0) {
    throw new Error("Dados base64 vazios ou inválidos.");
  }

  return uploadBufferToStorage(new Uint8Array(binaryBuffer), fileNameHint);
}

/**
 * Baixa imagem a partir de uma URL pública segura (com proteção SSRF) e armazena permanentemente.
 */
export async function uploadImageFromRemoteUrl(
  sourceUrl: string,
  fileNameHint?: string
): Promise<UploadResult> {
  const ssrfCheck = isAllowedPublicUrl(sourceUrl);
  if (!ssrfCheck.allowed) {
    throw new Error(`URL rejeitada por segurança: ${ssrfCheck.reason}`);
  }

  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "SeviiColecionaveis-MCP/1.1",
      Accept: "image/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem remota (HTTP ${response.status}: ${response.statusText})`);
  }

  const arrayBuf = await response.arrayBuffer();
  return uploadBufferToStorage(new Uint8Array(arrayBuf), fileNameHint);
}
