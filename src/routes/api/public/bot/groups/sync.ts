import { createFileRoute } from "@tanstack/react-router";
import { handleBotGroupsUpsert } from "@/lib/bot-groups-upsert.server";

export const Route = createFileRoute("/api/public/bot/groups/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => handleBotGroupsUpsert(request),
    },
  },
});
