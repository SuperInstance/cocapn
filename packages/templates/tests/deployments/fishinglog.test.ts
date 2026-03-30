import { describe, it, expect } from 'vitest';
import { fishinglogAi } from '../../src/deployments/fishinglog-ai.js';

describe('fishinglogAi deployment template', () => {
  it('has correct name and domain', () => {
    expect(fishinglogAi.name).toBe('Fishinglog.ai');
    expect(fishinglogAi.domain).toBe('fishinglog.ai');
  });

  it('includes fishing-buddy soul content', () => {
    expect(fishinglogAi.soul).toContain('Fishing Buddy');
    expect(fishinglogAi.soul).toContain('Pacific Northwest fishing expert');
    expect(fishinglogAi.soul).toContain('Salish Sea');
  });

  it('has correct config overrides', () => {
    expect(fishinglogAi.config.llm.provider).toBe('deepseek');
    expect(fishinglogAi.config.llm.model).toBe('deepseek-chat');
    expect(fishinglogAi.config.llm.maxTokens).toBe(4096);
    expect(fishinglogAi.config.mode.default).toBe('public');
    expect(fishinglogAi.config.brain.autoSync).toBe(true);
    expect(fishinglogAi.config.brain.knowledgePipeline).toBe(true);
  });

  it('has required modules enabled', () => {
    expect(fishinglogAi.modules).toContain('personality');
    expect(fishinglogAi.modules).toContain('knowledge');
    expect(fishinglogAi.modules).toContain('templates');
    expect(fishinglogAi.modules).toHaveLength(3);
  });

  it('has required plugins enabled', () => {
    expect(fishinglogAi.plugins).toContain('species-identifier');
    expect(fishinglogAi.plugins).toContain('catch-log');
    expect(fishinglogAi.plugins).toHaveLength(2);
  });

  it('has correct web title and favicon', () => {
    expect(fishinglogAi.web.title).toBe('Fishinglog.ai \u2014 Your AI Fishing Companion');
    expect(fishinglogAi.web.favicon).toBe('/favicon-fishinglog.svg');
  });

  it('has ocean blue theme', () => {
    expect(fishinglogAi.web.theme.darkMode).toBe(true);
    expect(fishinglogAi.web.theme.colors.primary).toBe('#1e88e5');
    expect(fishinglogAi.web.theme.colors.background).toBe('#0d47a1');
  });

  it('has deployment env vars', () => {
    expect(fishinglogAi.env.DEPLOYMENT_VERTICAL).toBe('fishinglog');
    expect(fishinglogAi.env.DEPLOYMENT_DOMAIN).toBe('fishinglog.ai');
  });
});
