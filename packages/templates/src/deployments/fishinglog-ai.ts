/**
 * Fishinglog.ai deployment template — AI fishing companion.
 *
 * A complete deployment configuration for the fishing vertical,
 * including soul, config, modules, plugins, and web theme.
 */

import { fishingBuddy } from '../souls/index.js';
import type { DeploymentTemplate, ThemeConfig } from './dmlog-ai.js';

// ─── Fishinglog.ai Deployment ────────────────────────────────────────────

const fishinglogAi: DeploymentTemplate = {
  name: 'Fishinglog.ai',
  domain: 'fishinglog.ai',

  soul: fishingBuddy,

  config: {
    llm: {
      provider: 'deepseek',
      model: 'deepseek-chat',
      maxTokens: 4096,
    },
    mode: {
      default: 'public',
    },
    brain: {
      autoSync: true,
      knowledgePipeline: true,
    },
  },

  modules: ['personality', 'knowledge', 'templates'],

  plugins: ['species-identifier', 'catch-log'],

  env: {
    DEPLOYMENT_VERTICAL: 'fishinglog',
    DEPLOYMENT_DOMAIN: 'fishinglog.ai',
  },

  web: {
    title: 'Fishinglog.ai \u2014 Your AI Fishing Companion',
    favicon: '/favicon-fishinglog.svg',
    theme: {
      colors: {
        primary: '#1e88e5',
        secondary: '#1565c0',
        accent: '#64b5f6',
        background: '#0d47a1',
        surface: '#1565c0',
        text: '#e3f2fd',
      },
      darkMode: true,
    },
  },
};

export { fishinglogAi };
