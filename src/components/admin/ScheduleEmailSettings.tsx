import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { getScheduleEmailSetting, saveScheduleEmailSetting } from "@/lib/schedule-email-settings.functions";

export function ScheduleEmailSettings() {
  const getSetting = useServerFn(getScheduleEmailSetting);
  const saveSetting = useServerFn(saveScheduleEmailSetting);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    getSetting().then((data) => { if (active) setEmail(data.email); })
      .catch(() => { if (active) setMessage("Não foi possível carregar o e-mail da loja."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  return <section className="border-b border-border pb-6 space-y-3">
    <h2 className="text-lg font-semibold">Confirmações de agendamento</h2>
    <form className="flex flex-wrap items-end gap-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      try { const saved = await saveSetting({ data: { email } }); setEmail(saved.email); setMessage("E-mail da loja salvo."); }
      catch { setMessage("Não foi possível salvar o e-mail. Tente novamente."); }
      finally { setBusy(false); }
    }}>
      <div className="flex-1 min-w-0 sm:min-w-64">
        <label htmlFor="schedule-store-email" className="block text-sm mb-1">E-mail da loja</label>
        <input id="schedule-store-email" type="email" required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <Button type="submit" disabled={busy}>{busy ? "Aguarde…" : "Salvar e-mail"}</Button>
    </form>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}