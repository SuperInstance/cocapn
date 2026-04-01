/**
 * DMlog.ai deployment template — the first vertical to ship.
 *
 * A complete deployment configuration for the TTRPG game console vertical,
 * including soul, config, modules, plugins, and web theme.
 */

import { dungeonMaster } from '../souls/index.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  darkMode: boolean;
}

export interface DeploymentTemplate {
  name: string;
  domain: string;
  soul: string;
  config: Record<string, any>;
  modules: string[];
  plugins: string[];
  env: Record<string, string>;
  web: {
    title: string;
    favicon: string;
    theme: ThemeConfig;
  };
}

// ─── DMlog.ai Deployment ────────────────────────────────────────────────

const dmlogAi: DeploymentTemplate = {
  name: 'DMlog.ai',
  domain: 'dmlog.ai',

  soul: dungeonMaster,

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
    },
  },

  modules: ['personality', 'knowledge', 'templates', 'fleet', 'vision'],

  plugins: ['dice-roller', 'character-stats', 'npc-panel'],

  env: {
    DEPLOYMENT_VERTICAL: 'dmlog',
    DEPLOYMENT_DOMAIN: 'dmlog.ai',
    GOOGLE_API_KEY: '',
  },

  vision: {
    provider: 'google',
    endpoints: [
      'POST /api/generate/character',
      'POST /api/generate/scene',
      'POST /api/generate/monster',
      'POST /api/generate/map',
      'POST /api/generate/item',
      'POST /api/generate/sprite',
      'GET /api/gallery',
    ],
  },

  web: {
    title: 'DMlog.ai \u2014 Your AI Dungeon Master',
    favicon: '/favicon-dmlog.svg',
    theme: {
      colors: {
        primary: '#c9a23c',
        secondary: '#8b7355',
        accent: '#e6c86e',
        background: '#1a1a2e',
        surface: '#16213e',
        text: '#e0e0e0',
      },
      darkMode: true,
    },
  },
};

export { dmlogAi };
