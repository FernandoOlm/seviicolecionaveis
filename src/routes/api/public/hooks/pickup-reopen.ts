import { createFileRoute } from "@tanstack/react-router";
import { verifyCronAuth } from "@/lib/cron-auth.server";

// Cron (a cada 30 min): reabre retiradas não concluídas até 14h do dia seguinte.
export const Route = createFileRoute("/api/public/hooks/pickup-reopen")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = verifyCronAuth(request);
        if (unauthorized) return unauthorized;
        const { reopenExpiredPickups } = await import("@/lib/pickup-reschedule.server");
        return Response.json(await reopenExpiredPickups());
      },
    },
  },
});
