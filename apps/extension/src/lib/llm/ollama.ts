import type { Message } from '../../types';
import type { LLMProvider, StreamChunk, StreamParams } from './provider';

const DEFAULT_BASE_URL = (
  import.meta.env.VITE_OLLAMA_BASE_URL ?? 'http://localhost:11434'
).trim();
const DEFAULT_MODEL = (
  import.meta.env.VITE_OLLAMA_MODEL ?? 'qwen2.5:7b'
).trim();

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function toOllamaMessages(
  messages: Message[],
  systemPrompt?: string,
): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant') {
      const content = m.content;
      if (typeof content === 'string' && content.length > 0) {
        out.push({ role: m.role, content });
      }
    }
  }
  return out;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly model: string;

  constructor(
    baseUrl: string = DEFAULT_BASE_URL,
    model: string = DEFAULT_MODEL,
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  private readonly baseUrl: string;

  async *streamChat({
    messages,
    systemPrompt,
    tools,
    signal,
  }: StreamParams): AsyncGenerator<StreamChunk, void, unknown> {
    const ollamaMessages = toOllamaMessages(messages, systemPrompt);
    if (ollamaMessages.length === 0) {
      yield { type: 'error', error: 'No messages to send' };
      return;
    }

    const ollamaTools: OllamaTool[] | undefined = tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const body: Record<string, unknown> = {
      model: this.model,
      messages: ollamaMessages,
      stream: true,
    };
    if (ollamaTools && ollamaTools.length > 0) body.tools = ollamaTools;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) return;
      yield {
        type: 'error',
        error: `Ollama unreachable at ${this.baseUrl}. Run "ollama serve" first. (${String(err)})`,
      };
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      yield { type: 'error', error: `${res.status}: ${errText}` };
      return;
    }
    if (!res.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolIdx = 0;

    type Chunk = {
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: { name?: string; arguments?: unknown };
        }>;
      };
      done?: boolean;
      error?: string;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev: Chunk;
          try {
            ev = JSON.parse(trimmed) as Chunk;
          } catch {
            continue;
          }
          if (ev.error) {
            yield { type: 'error', error: ev.error };
            return;
          }
          const msg = ev.message;
          if (msg) {
            if (typeof msg.content === 'string' && msg.content.length > 0) {
              yield { type: 'token', value: msg.content };
            }
            if (Array.isArray(msg.tool_calls)) {
              for (const tc of msg.tool_calls) {
                const name = tc.function?.name;
                const args = (tc.function?.arguments ?? {}) as unknown;
                if (typeof name === 'string') {
                  yield {
                    type: 'tool_call',
                    id: `oll-${Date.now()}-${toolIdx++}`,
                    name,
                    args,
                  };
                }
              }
            }
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      yield { type: 'error', error: `Stream interrupted: ${String(err)}` };
      return;
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}
