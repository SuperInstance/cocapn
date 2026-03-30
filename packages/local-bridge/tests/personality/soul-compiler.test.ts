/**
 * Tests for SoulCompiler — frontmatter parsing, section extraction,
 * system prompt generation, public/private separation, tone detection.
 */

import { describe, it, expect } from "vitest";
import { SoulCompiler } from "../../src/personality/soul-compiler.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_SOUL_MD = `---
name: Fishing Buddy
version: 1.2
tone: friendly
model: deepseek
maxTokens: 4096
greeting: Hey there, ready to catch some fish?
---

# Identity
You are Fishing Buddy, an AI assistant for fishermen.
You are helpful, knowledgeable, and enthusiastic about fishing.
You love talking about tackle, techniques, and the great outdoors.

## What You Know
- Pacific Northwest fishing regulations
- Species identification for 200+ freshwater fish
- Best fishing spots in Washington and Oregon
- Knot tying and rig setup
- Seasonal migration patterns

## What You Don't Do
- Never give medical advice
- Never share private user data
- Never guarantee fish will be caught
- Never recommend illegal fishing practices

## Public Face (shown to external users)
You are a helpful fishing assistant. You can answer questions about
fishing regulations, species identification, and general fishing tips.

## Greeting
Hey there, ready to catch some fish?
`;

const NO_FRONTMATTER = `# Identity
You are a simple assistant.

## What You Know
- General knowledge
- Basic math

## What You Don't Do
- Never hallucinate facts
`;

const EMPTY_SOUL = '';

const NO_SECTIONS = `Just some random text about nothing in particular.
No markdown headings here.`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SoulCompiler", () => {
  const compiler = new SoulCompiler();

  // ─── Frontmatter parsing ──────────────────────────────────────────────────

  describe("parseFrontmatter", () => {
    it("parses YAML frontmatter fields", () => {
      const { data, body } = compiler.parseFrontmatter(FULL_SOUL_MD);
      expect(data.name).toBe("Fishing Buddy");
      expect(data.version).toBe("1.2");
      expect(data.tone).toBe("friendly");
      expect(data.model).toBe("deepseek");
      expect(data.maxTokens).toBe("4096");
      expect(data.greeting).toBe("Hey there, ready to catch some fish?");
    });

    it("returns body without frontmatter delimiters", () => {
      const { body } = compiler.parseFrontmatter(FULL_SOUL_MD);
      expect(body).not.toContain("---");
      expect(body.startsWith("# Identity")).toBe(true);
    });

    it("returns empty data when no frontmatter present", () => {
      const { data, body } = compiler.parseFrontmatter(NO_FRONTMATTER);
      expect(data).toEqual({});
      expect(body).toBe(NO_FRONTMATTER.trim());
    });

    it("handles empty string input", () => {
      const { data, body } = compiler.parseFrontmatter(EMPTY_SOUL);
      expect(data).toEqual({});
      expect(body).toBe("");
    });

    it("parses quoted string values", () => {
      const input = `---\nname: "Test Bot"\nversion: '2.0'\n---\n\nBody here.`;
      const { data } = compiler.parseFrontmatter(input);
      expect(data.name).toBe("Test Bot");
      expect(data.version).toBe("2.0");
    });

    it("parses boolean values", () => {
      const input = `---\nactive: true\ndebug: false\n---\n\nBody.`;
      const { data } = compiler.parseFrontmatter(input);
      expect(data.active).toBe(true);
      expect(data.debug).toBe(false);
    });

    it("ignores comment lines in frontmatter", () => {
      const input = `---\n# This is a comment\nname: Bot\n---\n\nBody.`;
      const { data } = compiler.parseFrontmatter(input);
      expect(data.name).toBe("Bot");
      expect(data).not.toHaveProperty("# This is a comment");
    });

    it("handles frontmatter with CRLF line endings", () => {
      const input = "---\r\nname: CRLF Bot\r\n---\r\n\r\nBody.";
      const { data, body } = compiler.parseFrontmatter(input);
      expect(data.name).toBe("CRLF Bot");
      expect(body).toBe("Body.");
    });
  });

  // ─── Section extraction ───────────────────────────────────────────────────

  describe("extractTraits", () => {
    it("extracts traits from Identity section bullet points", () => {
      const traits = compiler.extractTraits(FULL_SOUL_MD);
      expect(traits.length).toBeGreaterThan(0);
      expect(traits).toContain("Pacific Northwest fishing regulations");
    });

    it("returns empty array when no Identity section", () => {
      const traits = compiler.extractTraits(NO_SECTIONS);
      expect(traits).toEqual([]);
    });
  });

  describe("extractConstraints", () => {
    it("extracts constraints from 'What You Don't Do' section", () => {
      const constraints = compiler.extractConstraints(FULL_SOUL_MD);
      expect(constraints).toContain("Never give medical advice");
      expect(constraints).toContain("Never share private user data");
      expect(constraints).toContain("Never guarantee fish will be caught");
      expect(constraints).toContain("Never recommend illegal fishing practices");
    });

    it("extracts from 'Constraints' heading alias", () => {
      const input = `# Identity\nBot\n\n## Constraints\n- No swearing\n- No politics`;
      const constraints = compiler.extractConstraints(input);
      expect(constraints).toContain("No swearing");
      expect(constraints).toContain("No politics");
    });

    it("returns empty array when no constraints section", () => {
      const constraints = compiler.extractConstraints(NO_SECTIONS);
      expect(constraints).toEqual([]);
    });
  });

  describe("extractCapabilities", () => {
    it("extracts capabilities from 'What You Know' section", () => {
      const caps = compiler.extractCapabilities(FULL_SOUL_MD);
      expect(caps).toContain("Pacific Northwest fishing regulations");
      expect(caps).toContain("Species identification for 200+ freshwater fish");
      expect(caps).toContain("Best fishing spots in Washington and Oregon");
    });

    it("extracts from 'Skills' heading alias", () => {
      const input = `# Identity\nBot\n\n## Skills\n- JavaScript\n- TypeScript\n- Fishing`;
      const caps = compiler.extractCapabilities(input);
      expect(caps).toEqual(["JavaScript", "TypeScript", "Fishing"]);
    });

    it("returns empty array when no capabilities section", () => {
      const caps = compiler.extractCapabilities(NO_SECTIONS);
      expect(caps).toEqual([]);
    });
  });

  // ─── Tone detection ───────────────────────────────────────────────────────

  describe("detectTone", () => {
    it("uses frontmatter tone when valid", () => {
      const tone = compiler.detectTone({ tone: "friendly" }, "");
      expect(tone).toBe("friendly");
    });

    it("returns 'custom' for unrecognized frontmatter tone", () => {
      const tone = compiler.detectTone({ tone: "sassy" }, "");
      expect(tone).toBe("custom");
    });

    it("detects 'formal' from content keywords", () => {
      const body = "You are a formal and respectful assistant. Be proper.";
      const tone = compiler.detectTone({}, body);
      expect(tone).toBe("formal");
    });

    it("detects 'casual' from content keywords", () => {
      const body = "Hey buddy, chill out and relax. Yo what's up?";
      const tone = compiler.detectTone({}, body);
      expect(tone).toBe("casual");
    });

    it("detects 'professional' from content keywords", () => {
      const body = "You are a professional business expert. Reliable and efficient.";
      const tone = compiler.detectTone({}, body);
      expect(tone).toBe("professional");
    });

    it("detects 'friendly' from content keywords", () => {
      const body = "You are warm and welcoming. Be kind and approachable.";
      const tone = compiler.detectTone({}, body);
      expect(tone).toBe("friendly");
    });

    it("defaults to 'casual' when no signals found", () => {
      const tone = compiler.detectTone({}, "No tone signals here.");
      expect(tone).toBe("casual");
    });

    it("frontmatter tone takes priority over content analysis", () => {
      const body = "You are warm and friendly and kind.";
      const tone = compiler.detectTone({ tone: "formal" }, body);
      expect(tone).toBe("formal");
    });
  });

  // ─── System prompt building ───────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    it("prepends name from frontmatter", () => {
      const prompt = compiler.buildSystemPrompt(
        { name: "TestBot" },
        "You are a test bot.",
      );
      expect(prompt.startsWith("You are TestBot.")).toBe(true);
    });

    it("includes body content", () => {
      const body = "# Identity\nYou are a bot.\n\n## What You Know\n- Things";
      const prompt = compiler.buildSystemPrompt({}, body);
      expect(prompt).toContain("You are a bot.");
      expect(prompt).toContain("Things");
    });

    it("handles empty body gracefully", () => {
      const prompt = compiler.buildSystemPrompt({ name: "Bot" }, "");
      expect(prompt).toBe("You are Bot.");
    });
  });

  // ─── Public/private separation ───────────────────────────────────────────

  describe("stripPrivateSections", () => {
    it("includes Identity section in public prompt", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.publicSystemPrompt).toContain("Fishing Buddy");
    });

    it("includes Public Face section in public prompt", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.publicSystemPrompt).toContain("helpful fishing assistant");
    });

    it("excludes private knowledge from public prompt", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.publicSystemPrompt).not.toContain("Pacific Northwest fishing regulations");
    });

    it("excludes constraints from public prompt", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.publicSystemPrompt).not.toContain("Never give medical advice");
    });
  });

  // ─── Full compilation ────────────────────────────────────────────────────

  describe("compile", () => {
    it("produces complete CompiledSoul from full soul.md", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);

      expect(compiled.systemPrompt).toContain("Fishing Buddy");
      expect(compiled.publicSystemPrompt).toContain("Fishing Buddy");
      expect(compiled.traits.length).toBeGreaterThan(0);
      expect(compiled.constraints.length).toBe(4);
      expect(compiled.capabilities.length).toBe(5);
      expect(compiled.tone).toBe("friendly");
      expect(compiled.version).toBe("1.2");
      expect(compiled.greeting).toBe("Hey there, ready to catch some fish?");
    });

    it("handles soul.md with no frontmatter", () => {
      const compiled = compiler.compile(NO_FRONTMATTER);

      expect(compiled.version).toBe("0.0");
      expect(compiled.constraints).toContain("Never hallucinate facts");
      expect(compiled.capabilities).toContain("General knowledge");
      expect(compiled.systemPrompt).toContain("simple assistant");
    });

    it("handles empty soul.md", () => {
      const compiled = compiler.compile(EMPTY_SOUL);

      expect(compiled.systemPrompt).toBe("");
      expect(compiled.publicSystemPrompt).toBe("");
      expect(compiled.traits).toEqual([]);
      expect(compiled.constraints).toEqual([]);
      expect(compiled.capabilities).toEqual([]);
      expect(compiled.tone).toBe("casual");
      expect(compiled.version).toBe("0.0");
      expect(compiled.greeting).toBe("");
    });

    it("handles soul.md with no markdown sections", () => {
      const compiled = compiler.compile(NO_SECTIONS);

      expect(compiled.systemPrompt).toContain("random text");
      expect(compiled.traits).toEqual([]);
      expect(compiled.constraints).toEqual([]);
      expect(compiled.capabilities).toEqual([]);
    });

    it("full system prompt contains all sections", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);

      // Should contain identity
      expect(compiled.systemPrompt).toContain("AI assistant for fishermen");
      // Should contain knowledge
      expect(compiled.systemPrompt).toContain("Knot tying and rig setup");
      // Should contain constraints
      expect(compiled.systemPrompt).toContain("Never give medical advice");
    });

    it("public system prompt is shorter than full prompt", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.publicSystemPrompt.length).toBeLessThan(
        compiled.systemPrompt.length,
      );
    });
  });

  // ─── Greeting extraction ──────────────────────────────────────────────────

  describe("greeting extraction", () => {
    it("extracts greeting from frontmatter", () => {
      const compiled = compiler.compile(FULL_SOUL_MD);
      expect(compiled.greeting).toBe("Hey there, ready to catch some fish?");
    });

    it("extracts greeting from Greeting section as fallback", () => {
      const input = `---
name: Bot
---

# Identity
You are Bot.

## Greeting
Hello, how can I help you today?
`;
      const compiled = compiler.compile(input);
      expect(compiled.greeting).toBe("Hello, how can I help you today?");
    });

    it("returns empty string when no greeting found", () => {
      const compiled = compiler.compile(NO_FRONTMATTER);
      expect(compiled.greeting).toBe("");
    });
  });
});
