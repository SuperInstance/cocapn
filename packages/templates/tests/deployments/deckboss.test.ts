import { describe, it, expect } from 'vitest';
import { deckbossAi } from '../../src/deployments/deckboss-ai.js';

describe('deckbossAi deployment template', () => {
  it('has correct name and domain', () => {
    expect(deckbossAi.name).toBe('Deckboss.ai');
    expect(deckbossAi.domain).toBe('deckboss.ai');
  });

  it('includes deckboss soul content', () => {
    expect(deckbossAi.soul).toContain('DeckBoss');
    expect(deckbossAi.soul).toContain('commercial fishing operations');
    expect(deckbossAi.soul).toContain('Bering Sea');
  });

  it('has correct config overrides', () => {
    expect(deckbossAi.config.llm.provider).toBe('deepseek');
    expect(deckbossAi.config.llm.model).toBe('deepseek-chat');
    expect(deckbossAi.config.llm.maxTokens).toBe(4096);
    expect(deckbossAi.config.mode.default).toBe('private');
    expect(deckbossAi.config.brain.autoSync).toBe(true);
    expect(deckbossAi.config.fleet.a2a).toBe(true);
  });

  it('has required modules enabled', () => {
    expect(deckbossAi.modules).toContain('personality');
    expect(deckbossAi.modules).toContain('knowledge');
    expect(deckbossAi.modules).toContain('fleet');
    expect(deckbossAi.modules).toContain('a2a');
    expect(deckbossAi.modules).toHaveLength(4);
  });

  it('has required plugins enabled', () => {
    expect(deckbossAi.plugins).toContain('species-identifier');
    expect(deckbossAi.plugins).toContain('crew-management');
    expect(deckbossAi.plugins).toContain('gear-tracker');
    expect(deckbossAi.plugins).toHaveLength(3);
  });

  it('has correct web title and favicon', () => {
    expect(deckbossAi.web.title).toBe('Deckboss.ai \u2014 AI Deck Boss for Commercial Fishing');
    expect(deckbossAi.web.favicon).toBe('/favicon-deckboss.svg');
  });

  it('has industrial dark theme with orange accent', () => {
    expect(deckbossAi.web.theme.darkMode).toBe(true);
    expect(deckbossAi.web.theme.colors.primary).toBe('#37474f');
    expect(deckbossAi.web.theme.colors.accent).toBe('#ff6d00');
    expect(deckbossAi.web.theme.colors.background).toBe('#1a1a1a');
  });

  it('has deployment env vars', () => {
    expect(deckbossAi.env.DEPLOYMENT_VERTICAL).toBe('deckboss');
    expect(deckbossAi.env.DEPLOYMENT_DOMAIN).toBe('deckboss.ai');
  });
});
