// Provisionamento de clientes a partir do WhatsApp (bot_seviicolecionaveis)
export const WHATSAPP_EMAIL_DOMAIN = "whatsapp.seviicolecionaveis.com.br";

/** E-mail interno gerado para contas criadas pelo WhatsApp (não é uma caixa real). */
export function isPlaceholderEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${WHATSAPP_EMAIL_DOMAIN}`);
}

export function randomPassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `${out}@1`;
}

export type EnsuredUser = {
  userId: string;
  /** E-mail real da conta (para clientes existentes) ou o login interno do WhatsApp. */
  email: string;
  created: boolean;
  /** Só é retornada quando o usuário foi criado agora ou quando resetPassword = true. */
  password: string | null;
};

/**
 * Localiza (por telefone/e-mail) ou cria o usuário do arrematante.
 * Clientes existentes mantêm nome, telefone e e-mail cadastrados — só campos vazios são preenchidos.
 * @param resetPassword força a geração de uma nova senha para usuário já existente.
 */
export async function ensureWhatsAppUser(
  phone: string,
  name: string | null,
  opts: { resetPassword?: boolean } = {},
): Promise<EnsuredUser | { error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const placeholderEmail = `${phone}@${WHATSAPP_EMAIL_DOMAIN}`;
  const password = randomPassword();

  // Busca pelo telefone ignorando formatação e o prefixo 55.
  const { data: foundId } = await (supabaseAdmin as any).rpc("find_user_by_phone", {
    _digits: phone,
  });

  let userId: string | null = (foundId as string | null) ?? null;
  let created = false;
  let email = placeholderEmail;

  if (!userId) {
    const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: placeholderEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: name ?? phone, phone, source: "bot_seviicolecionaveis" },
    });
    if (createErr) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users?.find((u) => u.email === placeholderEmail);
      if (!found) return { error: createErr.message };
      userId = found.id;
    } else {
      userId = createdUser.user?.id ?? null;
      created = true;
    }
  }

  if (!userId) return { error: "Falha ao criar usuário" };

  if (!created) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUser?.user?.email) email = authUser.user.email;
  }

  if (!created && opts.resetPassword) {
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (updErr) return { error: updErr.message };
  }

  const { data: existingProfile } = await (supabaseAdmin as any)
    .from("profiles")
    .select("user_id, full_name, phone, whatsapp")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingProfile) {
    await (supabaseAdmin as any).from("profiles").insert({
      user_id: userId,
      full_name: name ?? phone,
      phone,
      whatsapp: phone,
    });
  } else {
    const patch: Record<string, unknown> = {};
    if (!existingProfile.full_name) patch.full_name = name ?? phone;
    if (!existingProfile.phone) patch.phone = phone;
    if (!existingProfile.whatsapp) patch.whatsapp = phone;
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await (supabaseAdmin as any).from("profiles").update(patch).eq("user_id", userId);
    }
  }

  return {
    userId,
    email,
    created,
    password: created || opts.resetPassword ? password : null,
  };
}
