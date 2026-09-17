import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolSpec } from './llm.js';

/**
 * The bot reaches the catalogue only through MCP, with a key minted for one
 * chat session by the main app. That is the entire isolation boundary: no
 * database URL lives in this container, so the worst a prompt injection can do
 * is call these tools, as this user, until the key expires.
 */
export class CatalogueClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  constructor(mcpUrl: string, apiKey: string) {
    this.transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    this.client = new Client({ name: 'pickme-bot', version: '1.0.0' });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => {});
  }

  /** The server's own instructions, handed over during the handshake. */
  instructions(): string {
    return this.client.getInstructions() ?? '';
  }

  /**
   * Tool definitions in the shape the chat completions API wants. Descriptions
   * come straight from the MCP server, so there is one source of truth for what
   * each tool does and this container never duplicates it.
   */
  async tools(): Promise<ToolSpec[]> {
    const { tools } = await this.client.listTools();
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Run a tool and flatten the result to the string the model expects.
   *
   * Errors are returned as text rather than thrown: a failed tool call is
   * something the model should read and recover from, not something that should
   * tear down the whole exchange.
   */
  async call(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      const parts = (result.content as Array<{ type: string; text?: string }> | undefined) ?? [];
      const text = parts
        .filter((part) => part.type === 'text' && part.text)
        .map((part) => part.text)
        .join('\n');
      return text || JSON.stringify(result);
    } catch (err) {
      return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}
