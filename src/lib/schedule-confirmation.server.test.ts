import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notify: vi.fn(async (_c: Record<string, unknown>) => ({ duplicate: false })) }));
vi.mock("@/integrations/supabase/client.server", () => {
  const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), then: (r: any) => r({ data: [] }) };
  return { supabaseAdmin: { from: () => q } };
});
vi.mock("./fulfillment-alerts.server", () => ({ notifyFulfillmentChange: mocks.notify }));
import { sendScheduleConfirmations } from "./schedule-confirmation.server";

describe("envio das confirmações", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([["delivery", "delivery"], ["pickup", "pickup"], ["event", "event"]])("%s passa pelo alerta central com Calendar", async (kind, modality) => {
    await sendScheduleConfirmations({
      id: "12345678-abcd", email: "cliente@example.com", recipient_name: "Cliente",
      scheduled_at: "2026-10-29T22:00:00Z", schedule_kind: kind,
      notes: "Retirada em mãos: Aruana — quinta, 29/10/2026 às 19:00.",
    });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    const c = mocks.notify.mock.calls[0][0];
    expect(c.modality).toBe(modality);
    expect(c.notifyClient).toBe(true);
    expect(String(c.calendarUrl)).toContain("https://calendar.google.com/calendar/render?");
  });
  it("skipClient não envia ao cliente", async () => {
    await sendScheduleConfirmations({ id: "12345678", email: "c@x.com", recipient_name: "C", scheduled_at: "2026-10-29T22:00:00Z", schedule_kind: "pickup" }, "", { skipClient: true });
    expect(mocks.notify.mock.calls[0][0].notifyClient).toBe(false);
  });
  it("não notifica sem uma data", async () => {
    await sendScheduleConfirmations({ id: "12345678", email: "cliente@example.com", recipient_name: "Cliente", scheduled_at: null, schedule_kind: null });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
