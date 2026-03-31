/**
 * LLM — DeepSeek API provider via native fetch.
 *
 * Zero dependencies. Uses only the global fetch API (Node 18+).
 * Supports streaming SSE responses.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  text?: string;
  error?: string;
}

export interface LLMConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// ─── DeepSeek Provider ─────────────────────────────────────────────────────────

export class DeepSeek {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeout: number;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.model = config.model ?? 'deepseek-chat';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens ?? 2048;
    this.timeout = config.timeout ?? 30000;
  }

  /** Non-streaming chat completion */
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const res = await this.fetchAPI({ messages, stream: false });
    const data = await res.json() as {
      model: string;
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices[0];
    if (!choice) throw new Error('DeepSeek returned no choices');

    return {
      content: choice.message.content,
      model: data.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  }

  /** Streaming chat completion */
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const res = await this.fetchAPI({ messages, stream: true });
    if (!res.ok) {
      const error = await res.text().catch(() => 'unknown');
      yield { type: 'error', error: `DeepSeek ${res.status}: ${error}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { yield { type: 'error', error: 'No response body' }; return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') { yield { type: 'done' }; return; }

        try {
          const chunk = JSON.parse(payload) as {
            choices: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          };
          const content = chunk.choices[0]?.delta?.content;
          if (content) yield { type: 'content', text: content };
          if (chunk.choices[0]?.finish_reason === 'stop') { yield { type: 'done' }; return; }
        } catch { /* skip malformed chunks */ }
      }
    }
    yield { type: 'done' };
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private async fetchAPI(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: body.messages,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          stream: body.stream ?? false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
