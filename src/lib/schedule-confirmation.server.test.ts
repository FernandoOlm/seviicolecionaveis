import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async (_params: { recipientEmail: string; idempotencyKey?: string; templateData?: Record<string, unknown> }) => ({ success: true })),
  setting: vi.fn(async () => ({ data: { value: { email: "loja@example.com" } }, error: null })),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.setting }) }) }) },
}));
vi.mock("@/lib/email/send.server", () => ({ sendTransactionalEmailSafe: mocks.send }));
import { sendScheduleConfirmations } from "./schedule-confirmation.server";

describe("envio das confirmações", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["delivery", "pickup"])("envia %s para cliente e loja, Calendar somente para loja", async (kind) => {
    await sendScheduleConfirmations({
      id: "12345678-abcd", email: "cliente@example.com", recipient_name: "Cliente",
      scheduled_at: "2026-10-29T22:00:00Z", schedule_kind: kind,
      notes: "Retirada em mãos: Aruana — quinta, 29/10/2026 às 19:00.",
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    const [client, store] = mocks.send.mock.calls.map((call) => call[0]) as unknown as Array<{ recipientEmail: string; idempotencyKey: string; templateData: Record<string, unknown> }>;
    expect(client?.recipientEmail).toBe("cliente@example.com");
    expect(client?.templateData.calendarUrl).toBeUndefined();
    expect(client?.idempotencyKey).toBe("schedule-confirmed-client-12345678-abcd");
    expect(store?.recipientEmail).toBe("loja@example.com");
    expect(store?.templateData.calendarUrl).toContain("https://calendar.google.com/calendar/render?");
    expect(store?.idempotencyKey).toBe("schedule-confirmed-store-12345678-abcd");
  });
  it("não envia e-mail de agendamento sem uma data", async () => {
    await sendScheduleConfirmations({ id: "12345678", email: "cliente@example.com", recipient_name: "Cliente", scheduled_at: null, schedule_kind: null });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});