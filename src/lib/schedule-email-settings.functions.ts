import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SCHEDULE_EMAIL_SETTING } from "./schedule-confirmation";

export const getScheduleEmailSetting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Acesso negado.");
    const { data, error } = await context.supabase.from("app_settings").select("value").eq("key", SCHEDULE_EMAIL_SETTING).maybeSingle();
    if (error) throw new Error("Não foi possível carregar o e-mail da loja.");
    const value = data?.value;
    return { email: value && typeof value === "object" && !Array.isArray(value) && typeof value.email === "string" ? value.email : "" };
  });

export const saveScheduleEmailSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().email().max(254) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Acesso negado.");
    const { error } = await context.supabase.from("app_settings").upsert({ key: SCHEDULE_EMAIL_SETTING, value: { email: data.email }, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar o e-mail da loja.");
    return { email: data.email };
  });