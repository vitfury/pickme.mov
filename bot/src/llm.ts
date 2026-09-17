/**
 * Thin client for the OpenAI-compatible endpoint that LM Studio exposes.
 *
 * Deliberately hand-rolled rather than pulled from a framework: the only thing
 * we need beyond `fetch` is assembling streamed tool-call deltas, which is
 * twenty lines, and the endpoint has quirks (see `reasoning_content`) that a
 * framework would abstract away exactly when we need to see them.
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export interface StreamHandlers {
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
}

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

export interface LlmConfig {
  baseUrl: string;
  model: string;
  headers: Record<string, string>;
}

/**
 * The LLM could not be reached or refused to answer.
 *
 * Deliberately covers 4xx as well as 5xx: LM Studio answers a request for a
 * model it has not loaded with `400 Failed to load model`, which reads like a
 * client error but means the endpoint is simply not ready. Nothing the user
 * typed can cause or fix either case, so both surface the same way.
 */
export class LlmUnavailableError extends Error {
  readonly code = 'llm_unavailable';

  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/**
 * One streamed turn. Text is pushed through the handlers as it arrives; tool
 * calls are accumulated and returned whole, because a half-parsed JSON argument
 * string is useless to the caller.
 */
export async function streamCompletion(
  cfg: LlmConfig,
  messages: Message[],
  tools: ToolSpec[],
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<Completion> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.headers },
      signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        ...(tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      }),
    });
  } catch (err) {
    // An abort is the user pressing stop, not a failure — let it through as-is
    if (signal?.aborted) throw err;
    throw new LlmUnavailableError(err instanceof Error ? err.message : String(err));
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new LlmUnavailableError(
      `LLM returned ${res.status}: ${detail.slice(0, 300)}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let content = '';
  let finishReason: string | null = null;
  // Keyed by the `index` the endpoint assigns, because a single call's name and
  // arguments arrive across many chunks and several calls can interleave.
  const partial = new Map<number, ToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;

      let chunk: any;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta ?? {};

      // Qwen3.6 always reasons and cannot be talked out of it — /no_think,
      // reasoning_effort and chat_template_kwargs are all ignored by this
      // build. It surfaces as a separate field rather than <think> tags, so
      // there is nothing to strip, but the UI has to show it: the model spends
      // ten-plus seconds here before the first visible token.
      if (delta.reasoning_content) handlers.onReasoning?.(delta.reasoning_content);

      if (delta.content) {
        content += delta.content;
        handlers.onContent?.(delta.content);
      }

      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const entry = partial.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) entry.id = call.id;
        if (call.function?.name) entry.name += call.function.name;
        if (call.function?.arguments) entry.arguments += call.function.arguments;
        partial.set(index, entry);
      }
    }
  }

  const toolCalls = [...partial.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, call]) => call)
    .filter((call) => call.name);

  return { content, toolCalls, finishReason };
}
