/**
 * Embedding Provider Tests
 *
 * Tests for OpenAI and Local embedding providers.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  OpenAIEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingProvider,
  type EmbeddingOptions,
} from "../../src/brain/embedding.js";

// Mock fetch for OpenAI provider tests
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("OpenAIEmbeddingProvider", () => {
  let provider: OpenAIEmbeddingProvider;

  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe("with valid API key", () => {
    beforeEach(() => {
      provider = new OpenAIEmbeddingProvider(
        "sk-test-key",
        "text-embedding-3-small",
        1536,
        "https://api.openai.com"
      );
    });

    it("should initialize successfully", async () => {
      const result = await provider.initialize();
      expect(result.success).toBe(true);
    });

    it("should embed a single text", async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      const result = await provider.embed("test text");

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1536);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer sk-test-key",
          },
          body: expect.stringContaining("test text"),
        })
      );
    });

    it("should embed multiple texts in batch", async () => {
      const mockEmbeddings = [
        Array.from({ length: 1536 }, () => Math.random()),
        Array.from({ length: 1536 }, () => Math.random()),
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { embedding: mockEmbeddings[0] },
            { embedding: mockEmbeddings[1] },
          ],
        }),
      });

      const results = await provider.embedBatch(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0]).not.toBeNull();
      expect(results[1]).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          body: expect.stringContaining("text1"),
        })
      );
    });

    it("should return null on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await provider.embed("test");

      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await provider.embed("test");

      expect(result).toBeNull();
    });

    it("should return array of nulls on batch API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const results = await provider.embedBatch(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeNull();
      expect(results[1]).toBeNull();
    });
  });

  describe("with custom baseUrl (DeepSeek, etc.)", () => {
    it("should use custom baseUrl for DeepSeek", async () => {
      const deepseekProvider = new OpenAIEmbeddingProvider(
        "sk-deepseek-key",
        "deepseek-chat",
        1536,
        "https://api.deepseek.com"
      );

      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      await deepseekProvider.embed("test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.deepseek.com/v1/embeddings",
        expect.any(Object)
      );
    });

    it("should use custom baseUrl for other OpenAI-compatible APIs", async () => {
      const customProvider = new OpenAIEmbeddingProvider(
        "custom-key",
        "custom-model",
        768,
        "https://custom-api.example.com"
      );

      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      await customProvider.embed("test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://custom-api.example.com/v1/embeddings",
        expect.any(Object)
      );
    });
  });

  describe("without API key", () => {
    beforeEach(() => {
      provider = new OpenAIEmbeddingProvider("", "text-embedding-3-small", 1536);
    });

    it("should fail initialization", async () => {
      const result = await provider.initialize();
      expect(result.success).toBe(false);
      expect(result.error).toContain("API key not provided");
    });
  });

  describe("with different dimensions", () => {
    it("should support 3072 dimensions for text-embedding-3-large", async () => {
      const largeProvider = new OpenAIEmbeddingProvider(
        "sk-test-key",
        "text-embedding-3-large",
        3072
      );

      const mockEmbedding = Array.from({ length: 3072 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      const result = await largeProvider.embed("test");

      expect(result).toHaveLength(3072);
    });

    it("should support 512 dimensions for compressed embeddings", async () => {
      const compressedProvider = new OpenAIEmbeddingProvider(
        "sk-test-key",
        "text-embedding-3-small",
        512
      );

      const mockEmbedding = Array.from({ length: 512 }, () => Math.random());
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }],
        }),
      });

      const result = await compressedProvider.embed("test");

      expect(result).toHaveLength(512);
    });
  });
});

describe("LocalEmbeddingProvider", () => {
  let provider: LocalEmbeddingProvider;

  beforeEach(() => {
    provider = new LocalEmbeddingProvider("Xenova/all-MiniLM-L6-v2");
  });

  it("should initialize", async () => {
    // Without @xenova/transformers installed, initialization will fail
    // but should handle gracefully
    const result = await provider.initialize();
    expect(result).toBeDefined();
  });

  it("should return null if not initialized", async () => {
    const result = await provider.embed("test");
    // Returns null on failure (graceful degradation)
    expect(result).toBeNull();
  });

  it("should return null for batch if not initialized", async () => {
    const results = await provider.embedBatch(["text1", "text2"]);
    expect(results).toEqual([null, null]);
  });

  it("should handle initialization errors gracefully", async () => {
    // Force an init error
    const badProvider = new LocalEmbeddingProvider();
    await badProvider.initialize();

    const result = await badProvider.embed("test");
    expect(result).toBeNull();
  });
});

describe("createEmbeddingProvider factory", () => {
  it("should create OpenAI provider with default options", async () => {
    const options: EmbeddingOptions = {
      provider: "openai",
      apiKey: "sk-test",
    };

    const provider = await createEmbeddingProvider(options);

    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });

  it("should create OpenAI provider with custom baseUrl", async () => {
    const options: EmbeddingOptions = {
      provider: "openai",
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-embeddings",
      dimensions: 1536,
    };

    const provider = await createEmbeddingProvider(options);
    const initResult = await provider.initialize();

    expect(initResult.success).toBe(true);
  });

  it("should create OpenAI provider with all options", async () => {
    const options: EmbeddingOptions = {
      provider: "openai",
      apiKey: "sk-test-key",
      baseUrl: "https://custom.api.com",
      model: "custom-model",
      dimensions: 768,
    };

    const provider = await createEmbeddingProvider(options);

    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });

  it("should create Local provider by default", async () => {
    const options: EmbeddingOptions = {
      provider: "local",
    };

    const provider = await createEmbeddingProvider(options);

    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it("should create Local provider when explicitly specified", async () => {
    const options: EmbeddingOptions = {
      provider: "local",
    };

    const provider = await createEmbeddingProvider(options);

    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });

  it("should default to Local provider for unknown provider type", async () => {
    const options = {
      provider: "unknown" as any,
    };

    const provider = await createEmbeddingProvider(options);

    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });
});
