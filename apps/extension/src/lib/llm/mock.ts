import type { LLMProvider, StreamChunk, StreamParams } from './provider';

const TOKEN_DELAY_MS = 25;

export class MockProvider implements LLMProvider {
  readonly name = 'mock';

  async *streamChat({
    messages,
    signal,
  }: StreamParams): AsyncGenerator<StreamChunk, void, unknown> {
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user' && 'content' in m);
    const userText =
      lastUser && 'content' in lastUser ? lastUser.content : '';
    const reply =
      userText.length > 0
        ? `Mock reply: tôi nhận "${userText}". UI streaming chạy OK. Round sau wire Ollama hoặc Anthropic thật.`
        : 'Mock reply: chưa có tin nhắn nào. Hãy gõ một câu hỏi.';

    for (const ch of reply) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'aborted' };
        return;
      }
      yield { type: 'token', value: ch };
      await new Promise((r) => setTimeout(r, TOKEN_DELAY_MS));
    }
    yield { type: 'done' };
  }
}
