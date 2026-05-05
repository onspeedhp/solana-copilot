import type { Message } from '../../types';

export type StreamChunk =
  | { type: 'token'; value: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'done' }
  | { type: 'error'; error: string };

export type ToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type StreamParams = {
  messages: Message[];
  systemPrompt?: string;
  tools?: ToolSpec[];
  signal?: AbortSignal;
};

export interface LLMProvider {
  readonly name: string;
  streamChat(
    params: StreamParams,
  ): AsyncGenerator<StreamChunk, void, unknown>;
}
