import { createFileRoute } from "@tanstack/react-router";
import { createTanStackOAuthProtectedResourceMetadataHandler } from "@lovable.dev/mcp-js/stacks/tanstack";
import mcp from "../lib/mcp/index";

// RFC 9728 path-suffixed metadata for the /mcp resource; same document as the root.
export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      ANY: createTanStackOAuthProtectedResourceMetadataHandler(mcp, {
        resourcePath: "/mcp",
        metadataPath: "/.well-known/oauth-protected-resource/mcp",
        trustForwardedHost: true,
        forwardedHostTrustedByPlatform: true,
        trustForwardedProto: true,
      }),
    },
  },
});
