export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  destructive: boolean;
  idempotent: boolean;
  handler: (args: Record<string, any>, context: { userId: string; email: string | null }) => Promise<any>;
}
