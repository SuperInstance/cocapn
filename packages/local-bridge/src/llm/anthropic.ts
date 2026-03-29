/**
 * Anthropic LLM Provider
 *
 * Uses the Anthropic Messages API for chat completions.
 * Supports both streaming and non-streaming modes.
 *
 * API: https://api.anthropic.com/v1/messages
 *
 * Key differences from OpenAI format:
 *   - Anthropic uses `messages` endpoint (not `chat/completions`)
 *   - System prompt is a top-level parameter (not a message)
 *   - Anthropic uses `content` array (not `message.content` string)
 *   - Authentication uses `x-api-key` header + `anthropic-version`
 */

import type {
  LLMProvider,
  ProviderConfig,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from './provider.js';
import { getKeepAliveAgent } from './keep-alive.js';

// ─── Anthropic model patterns ─────────────────────────────────────────────────

const ANTHROPIC_MODELS = /^claude-/;

// ─── Default config ───────────────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-sonnet-4-20250514',
  apiVersion: '2023-06-01',
  timeout: 60000,
  maxRetries: 2,
};

// ─── AnthropicProvider ────────────────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private baseUrl: string;
  private apiVersion: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, '');
    this.apiVersion = DEFAULTS.apiVersion;
    this.timeout = config.timeout ?? DEFAULTS.timeout;
    this.maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
  }

  supports(model: string): boolean {
    return ANTHROPIC_MODELS.test(model);
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? DEFAULTS.defaultModel;
    const { anthropicMessages, systemPrompt } = this.prepareMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
    };
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const data = await this.requestWithRetry(body) as AnthropicResponse;

    // Extract text from content blocks
    const text = data.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return {
      content: text,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const model = options?.model ?? DEFAULTS.defaultModel;
    const { anthropicMessages, systemPrompt } = this.prepareMessages(messages, options?.systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await this.fetch(body);
    if (!response.ok) {
      const error = await response.text();
      yield { type: 'error', error: `Anthropic error: ${response.status} ${error}` };
      return;
    }

    for await (const event of this.parseSSE(response)) {
      switch (event.type) {
        case 'content_block_delta': {
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'content', text: event.delta.text };
          }
          break;
        }

        case 'message_delta': {
          if (event.usage) {
            yield {
              type: 'done',
              usage: {
                inputTokens: 0, // Anthropic reports input in message_start
                outputTokens: event.usage.output_tokens,
              },
            };
          }
          break;
        }

        case 'message_stop': {
          yield { type: 'done' };
          return;
        }

        case 'error': {
          yield { type: 'error', error: event.error?.message ?? 'Unknown Anthropic streaming error' };
          return;
        }
      }
    }

    yield { type: 'done' };
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private prepareMessages(
    messages: ChatMessage[],
    systemPrompt?: string,
  ): { anthropicMessages: AnthropicMessage[]; systemPrompt?: string } {
    // Anthropic separates system from messages
    // Merge multiple system messages into one
    let mergedSystem = systemPrompt ?? '';

    const anthropicMessages: AnthropicMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        mergedSystem += (mergedSystem ? '\n\n' : '') + msg.content;
        continue;
      }
      anthropicMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const result: { anthropicMessages: AnthropicMessage[]; systemPrompt?: string } = {
      anthropicMessages,
    };
    if (mergedSystem) {
      result.systemPrompt = mergedSystem;
    }
    return result;
  }

  private async requestWithRetry(body: Record<string, unknown>): Promise<unknown> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }

      try {
        const response = await this.fetch(body);
        if (!response.ok) {
          const errorText = await response.text();
          lastError = new Error(`Anthropic API error ${response.status}: ${errorText}`);

          if (response.status === 429 || response.status >= 500) {
            continue;
          }
          throw lastError;
        }
        return await response.json();
      } catch (err) {
        if (err instanceof TypeError) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error('Anthropic request failed after retries');
  }

  private async fetch(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        dispatcher: getKeepAliveAgent(this.name),
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Anthropic request timeout');
      }
      throw err;
    }
  }

  private async *parseSSE(response: Response): AsyncIterable<AnthropicStreamEvent> {
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        try {
          yield JSON.parse(trimmed.slice(6)) as AnthropicStreamEvent;
        } catch {
          // Skip malformed events
        }
      }
    }
  }
}

// ─── Anthropic types ──────────────────────────────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  model: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

type AnthropicStreamEvent =
  | { type: 'message_start'; message: { usage: { input_tokens: number } } }
  | { type: 'content_block_start'; index: number; content_block: { type: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string }; usage: { output_tokens: number } }
  | { type: 'message_stop' }
  | { type: 'error'; error: { type: string; message: string } };
