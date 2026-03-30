/**
 * Local LLM Providers — Ollama + llama.cpp
 *
 * For air-gapped and offline deployments. Implements the same LLMProvider
 * interface as DeepSeek/OpenAI/Anthropic but targets locally-running models.
 *
 * Ollama:  http://localhost:11434/api/chat  (OpenAI-compatible chat API)
 * llama.cpp: http://localhost:8080/completion  (simple completion API)
 */

import type {
  LLMProvider,
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from '../provider.js';
import { getKeepAliveAgent } from '../keep-alive.js';

// ─── Known local model names ────────────────────────────────────────────────

const OLLAMA_MODELS = [
  'llama3', 'llama3.1', 'llama3.2', 'llama3.3',
  'mistral', 'mistral-nemo', 'mixtral',
  'codellama', 'phi3', 'phi3.5',
  'deepseek-coder', 'deepseek-coder-v2',
  'qwen2', 'qwen2.5', 'qwen3',
  'gemma2', 'gemma3',
  'nomic-embed-text',
];

const LLAMACPP_MODELS = [
  'llama-cpp', 'llamacpp',
];

// ─── Defaults ───────────────────────────────────────────────────────────────

const OLLAMA_DEFAULTS = {
  endpoint: 'http://localhost:11434',
  defaultModel: 'llama3',
  timeout: 120_000, // Local models can be slow
};

const LLAMACPP_DEFAULTS = {
  endpoint: 'http://localhost:8080',
  defaultModel: 'llama-cpp',
  timeout: 120_000,
};

// ─── Ollama Provider ────────────────────────────────────────────────────────

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private endpoint: string;
  private timeout: number;

  constructor(config?: { endpoint?: string; timeout?: number }) {
    this.endpoint = (config?.endpoint ?? OLLAMA_DEFAULTS.endpoint).replace(/\/$/, '');
    this.timeout = config?.timeout ?? OLLAMA_DEFAULTS.timeout;
  }

  supports(model: string): boolean {
    return OLLAMA_MODELS.some((m) => model === m || model.startsWith(m + ':'));
  }

  /** Check if the Ollama server is reachable and list available models. */
  async listModels(): Promise<string[]> {
    let response: Response;
    try {
      response = await this.fetchRaw(`${this.endpoint}/api/tags`);
    } catch (err) {
      throw new Error(
        `Ollama unavailable at ${this.endpoint}: ${err instanceof Error ? err.message : 'connection refused'}`,
      );
    }
    if (!response.ok) {
      throw new Error(`Ollama unavailable at ${this.endpoint}: ${response.status}`);
    }
    const data = await response.json() as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name);
  }

  /** Check whether the Ollama server is reachable. */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchRaw(`${this.endpoint}/api/tags`, 5000);
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? OLLAMA_DEFAULTS.defaultModel;
    const prepared = this.prepareMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: prepared,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    const response = await this.fetchChat(body);
    if (!response.ok) {
      const error = await response.text();
      throw this.buildUnavailableError(response.status, error, model);
    }

    const data = await response.json() as OllamaChatResponse;
    return {
      content: data.message.content,
      model: data.model,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const model = options?.model ?? OLLAMA_DEFAULTS.defaultModel;
    const prepared = this.prepareMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: prepared,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 2048,
      },
    };

    let response: Response;
    try {
      response = await this.fetchChat(body);
    } catch (err) {
      yield {
        type: 'error',
        error: `Ollama unavailable at ${this.endpoint}: ${err instanceof Error ? err.message : 'connection refused'}`,
      };
      return;
    }

    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: this.buildUnavailableMessage(response.status, error, model) };
      return;
    }

    let totalOutput = 0;
    for await (const chunk of this.parseOllamaStream(response)) {
      if (chunk.message?.content) {
        yield { type: 'content', text: chunk.message.content };
        totalOutput++;
      }
      if (chunk.done) {
        yield {
          type: 'done',
          usage: {
            inputTokens: chunk.prompt_eval_count ?? 0,
            outputTokens: chunk.eval_count ?? totalOutput,
          },
        };
        return;
      }
    }
    yield { type: 'done' };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private prepareMessages(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
    if (!systemPrompt) return messages;
    if (messages.length > 0 && messages[0]?.role === 'system') return messages;
    return [{ role: 'system', content: systemPrompt }, ...messages];
  }

  private async fetchChat(body: Record<string, unknown>): Promise<Response> {
    return this.fetchRaw(`${this.endpoint}/api/chat`, this.timeout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async fetchRaw(url: string, timeout?: number, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        dispatcher: getKeepAliveAgent(this.name),
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Ollama request timeout (${timeout ?? this.timeout}ms)`);
      }
      throw err;
    }
  }

  private async *parseOllamaStream(response: Response): AsyncIterable<OllamaStreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

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
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as OllamaStreamChunk;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }

  private buildUnavailableError(status: number, error: string, model: string): Error {
    if (status === 404) {
      return new Error(
        `Ollama model "${model}" not found. Run: ollama pull ${model}\n` +
        `List available models: ollama list\n` +
        `Download Ollama: https://ollama.com`,
      );
    }
    return new Error(this.buildUnavailableMessage(status, error, model));
  }

  private buildUnavailableMessage(status: number, error: string, model: string): string {
    return `Ollama error ${status}: ${error}. ` +
      `Ensure Ollama is running at ${this.endpoint} and model "${model}" is available.`;
  }
}

// ─── llama.cpp Provider ─────────────────────────────────────────────────────

export class LlamaCppProvider implements LLMProvider {
  readonly name = 'llama-cpp';
  private endpoint: string;
  private timeout: number;

  constructor(config?: { endpoint?: string; timeout?: number }) {
    this.endpoint = (config?.endpoint ?? LLAMACPP_DEFAULTS.endpoint).replace(/\/$/, '');
    this.timeout = config?.timeout ?? LLAMACPP_DEFAULTS.timeout;
  }

  supports(model: string): boolean {
    return LLAMACPP_MODELS.some((m) => model === m || model.startsWith(m + ':'));
  }

  /** Check whether the llama.cpp server is reachable. */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchRaw(`${this.endpoint}/health`, 5000);
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const prompt = this.messagesToPrompt(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      prompt,
      n_predict: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      stream: false,
    };

    const response = await this.fetchCompletion(body);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `llama.cpp error ${response.status}: ${error}. ` +
        `Ensure llama.cpp server is running at ${this.endpoint}.`,
      );
    }

    const data = await response.json() as LlamaCppResponse;
    return {
      content: data.content,
      model: options?.model ?? LLAMACPP_DEFAULTS.defaultModel,
      usage: {
        inputTokens: data.tokens_evaluated ?? 0,
        outputTokens: data.tokens_predicted ?? 0,
        totalTokens: (data.tokens_evaluated ?? 0) + (data.tokens_predicted ?? 0),
      },
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const prompt = this.messagesToPrompt(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      prompt,
      n_predict: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    let response: Response;
    try {
      response = await this.fetchCompletion(body);
    } catch (err) {
      yield {
        type: 'error',
        error: `llama.cpp unavailable at ${this.endpoint}: ${err instanceof Error ? err.message : 'connection refused'}`,
      };
      return;
    }

    if (!response.ok) {
      const error = await response.text();
      yield {
        type: 'error',
        error: `llama.cpp error ${response.status}: ${error}. ` +
          `Ensure llama.cpp server is running at ${this.endpoint}.`,
      };
      return;
    }

    for await (const chunk of this.parseLlamaCppStream(response)) {
      if (chunk.content) {
        yield { type: 'content', text: chunk.content };
      }
      if (chunk.stop) {
        yield {
          type: 'done',
          usage: {
            inputTokens: chunk.tokens_evaluated ?? 0,
            outputTokens: chunk.tokens_predicted ?? 0,
          },
        };
        return;
      }
    }
    yield { type: 'done' };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /**
   * Convert chat messages to a simple prompt string.
   * llama.cpp's /completion endpoint takes a raw prompt, not chat format.
   */
  private messagesToPrompt(messages: ChatMessage[], systemPrompt?: string): string {
    const parts: string[] = [];
    if (systemPrompt) parts.push(`System: ${systemPrompt}\n`);
    for (const msg of messages) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${label}: ${msg.content}\n`);
    }
    parts.push('Assistant:');
    return parts.join('\n');
  }

  private async fetchCompletion(body: Record<string, unknown>): Promise<Response> {
    return this.fetchRaw(`${this.endpoint}/completion`, this.timeout, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async fetchRaw(url: string, timeout?: number, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? this.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        dispatcher: getKeepAliveAgent(this.name),
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`llama.cpp request timeout (${timeout ?? this.timeout}ms)`);
      }
      throw err;
    }
  }

  private async *parseLlamaCppStream(response: Response): AsyncIterable<LlamaCppStreamChunk> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // llama.cpp streams newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          yield JSON.parse(data) as LlamaCppStreamChunk;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}

// ─── Ollama response types ──────────────────────────────────────────────────

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  message?: { role: string; content: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ─── llama.cpp response types ───────────────────────────────────────────────

interface LlamaCppResponse {
  content: string;
  model?: string;
  tokens_evaluated?: number;
  tokens_predicted?: number;
  stop?: string;
}

interface LlamaCppStreamChunk {
  content: string;
  stop?: boolean;
  tokens_evaluated?: number;
  tokens_predicted?: number;
  stop_type?: string;
}
