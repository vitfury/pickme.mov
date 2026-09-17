import { create } from 'zustand';
import { useAuthStore } from '@/stores/authStore';
import { refreshAccessToken } from '@/api/client';
import i18n from '@/i18n/config';

export interface ToolRun {
  name: string;
  args: Record<string, unknown>;
  done: boolean;
  ok: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Streamed while the model thinks. Qwen always reasons and cannot be stopped. */
  reasoning?: string;
  tools?: ToolRun[];
  /** Код збою; сам текст живе в i18n під chat.error */
  errorCode?: string;
  /** Відповідь дописана до кінця — лише тоді панель ховає проєктор і показує текст */
  done?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  streaming: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

let controller: AbortController | null = null;

const id = () => Math.random().toString(36).slice(2);

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  streaming: false,

  stop: () => {
    controller?.abort();
    controller = null;
    set({ streaming: false });
  },

  clear: () => {
    controller?.abort();
    controller = null;
    set({ messages: [], streaming: false });
  },

  send: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || get().streaming) return;

    const userMessage: ChatMessage = { id: id(), role: 'user', content: trimmed };
    const replyId = id();

    set((s) => ({
      messages: [
        ...s.messages,
        userMessage,
        { id: replyId, role: 'assistant', content: '', reasoning: '', tools: [] },
      ],
      streaming: true,
    }));

    // Mutate the one message in place rather than rebuilding the list on every
    // token — a local model emits hundreds of deltas per answer.
    const patch = (fn: (m: ChatMessage) => void) =>
      set((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== replyId) return m;
          const next = { ...m };
          fn(next);
          return next;
        }),
      }));

    controller = new AbortController();

    try {
      const history = get()
        .messages.filter((m) => m.id !== replyId && (m.content || m.role === 'user'))
        .map((m) => ({ role: m.role, content: m.content }));

      // Мову беремо з i18n, а не зі стора: саме вона визначає, що зараз на екрані
      const body = JSON.stringify({
        messages: history,
        locale: i18n.language.startsWith('uk') ? 'uk' : 'en',
      });

      const call = (token: string | null) =>
        fetch('/api/v1/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          signal: controller!.signal,
          body,
        });

      let res = await call(useAuthStore.getState().accessToken);

      // Access живе 15 хвилин, а панель відкривають і через годину. Стрім іде
      // голим fetch, повз axios-перехоплювач, тож оновлюємо токен тут самі —
      // тією ж функцією, щоб паралельні спроби не спалили refresh двічі.
      if (res.status === 401) {
        const fresh = await refreshAccessToken();
        if (fresh) res = await call(fresh);
      }

      if (!res.ok || !res.body) {
        // Бекенд називає причину кодом; якщо не назвав — виводимо з статусу
        const named = await res.json().catch(() => null);
        patch((m) => {
          m.errorCode =
            named?.code ??
            (res.status === 401 ? 'session_expired'
              : res.status === 502 || res.status === 503 ? 'llm_unavailable'
              : 'unknown');
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case 'reasoning':
              patch((m) => { m.reasoning = (m.reasoning ?? '') + event.text; });
              break;
            case 'text':
              patch((m) => { m.content += event.text; });
              break;
            case 'tool-start':
              patch((m) => {
                m.tools = [...(m.tools ?? []), { name: event.name, args: event.args, done: false, ok: false }];
              });
              break;
            case 'tool-end':
              patch((m) => {
                const tools = [...(m.tools ?? [])];
                for (let i = tools.length - 1; i >= 0; i--) {
                  if (tools[i].name === event.name && !tools[i].done) {
                    tools[i] = { ...tools[i], done: true, ok: event.ok };
                    break;
                  }
                }
                m.tools = tools;
              });
              break;
            case 'error':
              patch((m) => { m.errorCode = event.code ?? 'unknown'; });
              if (event.detail) console.warn('[chat]', event.code, event.detail);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        patch((m) => { m.errorCode = 'connection_lost'; });
      }
    } finally {
      // done і при аборті, і при обриві: скільки тексту є — стільки й покажемо
      patch((m) => { m.done = true; });
      controller = null;
      set({ streaming: false });
    }
  },
}));
