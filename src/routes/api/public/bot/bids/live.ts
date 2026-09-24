import { createFileRoute } from "@tanstack/react-router";
import { Route as LiveBidsRoute } from "../auctions/bids.live";

export const Route = createFileRoute("/api/public/bot/bids/live")({
  server: {
    handlers: {
      POST: async (ctx) => {
        const handler = (LiveBidsRoute as any)?.options?.server?.handlers?.POST;
        if (typeof handler === "function") {
          return handler(ctx);
        }
        return Response.json({ error: "Handler not found" }, { status: 500 });
      },
    },
  },
});
