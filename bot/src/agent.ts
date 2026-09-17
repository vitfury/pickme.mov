import { streamCompletion, LlmUnavailableError, type LlmConfig, type Message, type ToolSpec } from './llm.js';
import { CatalogueClient } from './mcp-client.js';
import { buildSystemPrompt } from './prompt.js';

/**
 * What went wrong, in a form the browser can translate. The bot has no business
 * knowing the user's language, so it names the failure and the panel writes it.
 */
export type ChatErrorCode =
  | 'llm_unavailable'
  | 'catalogue_unavailable'
  | 'too_many_steps'
  | 'unknown';

/** Events pushed to the browser as they happen, one SSE frame each. */
export type ChatEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool-start'; name: string; args: Record<string, unknown> }
  | { type: 'tool-end'; name: string; ok: boolean }
  | { type: 'done' }
  | { type: 'error'; code: ChatErrorCode; detail: string };

export interface AgentInput {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale: string;
  mcpUrl: string;
  apiKey: string;
}

// A recommendation needs a search plus details on the shortlist, and recording
// what the user watched can add a couple more. Past that the model is looping,
// and every extra step costs ten-plus seconds on this hardware.
const MAX_STEPS = 6;

// search_titles will happily return 200 titles with full overviews — sixty-odd
// kilobytes. A hosted model would shrug; a local one spends a minute reading it.
const SEARCH_LIMIT_CAP = 50;

/**
 * Run one exchange to completion, emitting events as they happen.
 *
 * The loop is deliberately visible rather than hidden behind a framework: it is
 * the only place where the model's output turns into database writes, so it is
 * worth being able to read top to bottom.
 */
export async function* runAgent(
  cfg: LlmConfig,
  input: AgentInput,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const catalogue = new CatalogueClient(input.mcpUrl, input.apiKey);

  let tools: ToolSpec[];
  try {
    await catalogue.connect();
    tools = await catalogue.tools();
  } catch (err) {
    yield { type: 'error', code: 'catalogue_unavailable', detail: errText(err) };
    return;
  }

  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt(catalogue.instructions(), input.locale) },
    ...input.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // Buffered rather than yielded from inside the callbacks, because a
      // generator cannot yield from a synchronous callback the fetch loop calls.
      const pending: ChatEvent[] = [];
      const completion = await streamCompletion(
        cfg,
        messages,
        tools,
        {
          onReasoning: (text) => pending.push({ type: 'reasoning', text }),
          onContent: (text) => pending.push({ type: 'text', text }),
        },
        signal,
      );

      yield* pending;

      if (completion.toolCalls.length === 0) {
        yield { type: 'done' };
        return;
      }

      messages.push({
        role: 'assistant',
        content: completion.content || null,
        tool_calls: completion.toolCalls.map((call) => ({
          id: call.id,
          type: 'function' as const,
          function: { name: call.name, arguments: call.arguments },
        })),
      });

      for (const call of completion.toolCalls) {
        const args = parseArgs(call.arguments);
        clampSearch(call.name, args);

        yield { type: 'tool-start', name: call.name, args };
        const result = await catalogue.call(call.name, args);
        const ok = !result.startsWith('{"error"');
        yield { type: 'tool-end', name: call.name, ok };

        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    // Out of steps with tool calls still coming: say so rather than leaving the
    // panel hanging on a spinner that will never resolve.
    yield { type: 'error', code: 'too_many_steps', detail: `stopped after ${MAX_STEPS} steps` };
  } catch (err) {
    if (signal.aborted) return;
    yield {
      type: 'error',
      code: err instanceof LlmUnavailableError ? 'llm_unavailable' : 'unknown',
      detail: errText(err),
    };
  } finally {
    await catalogue.close();
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clampSearch(name: string, args: Record<string, unknown>): void {
  if (name !== 'search_titles') return;
  const limit = typeof args.limit === 'number' ? args.limit : SEARCH_LIMIT_CAP;
  args.limit = Math.min(limit, SEARCH_LIMIT_CAP);
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
