/**
 * Deckboss.ai deployment template — AI deck boss for commercial fishing.
 *
 * A complete deployment configuration for the commercial fishing vertical,
 * including soul, config, modules, plugins, and web theme.
 */

import { deckboss } from '../souls/index.js';
import type { DeploymentTemplate, ThemeConfig } from './dmlog-ai.js';

// ─── Deckboss.ai Deployment ──────────────────────────────────────────────

const deckbossAi: DeploymentTemplate = {
  name: 'Deckboss.ai',
  domain: 'deckboss.ai',

  soul: deckboss,

  config: {
    llm: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      maxTokens: 4096,
    },
    mode: {
      default: 'private',
    },
    brain: {
      autoSync: true,
    },
    fleet: {
      a2a: true,
    },
  },

  modules: ['personality', 'knowledge', 'fleet', 'a2a'],

  plugins: ['species-identifier', 'crew-management', 'gear-tracker'],

  env: {
    DEPLOYMENT_VERTICAL: 'deckboss',
    DEPLOYMENT_DOMAIN: 'deckboss.ai',
  },

  web: {
    title: 'Deckboss.ai \u2014 AI Deck Boss for Commercial Fishing',
    favicon: '/favicon-deckboss.svg',
    theme: {
      colors: {
        primary: '#37474f',
        secondary: '#263238',
        accent: '#ff6d00',
        background: '#1a1a1a',
        surface: '#37474f',
        text: '#eceff1',
      },
      darkMode: true,
    },
  },
};

export { deckbossAi };
