/**
 * Deployment template registry — ready-to-deploy vertical configurations.
 *
 * Each deployment bundles soul, config, modules, plugins, env, and web theme
 * into a single template that can be applied during scaffolding or deployment.
 */

export { dmlogAi } from './dmlog-ai.js';
export { fishinglogAi } from './fishinglog-ai.js';
export { deckbossAi } from './deckboss-ai.js';
export type { DeploymentTemplate, ThemeConfig } from './dmlog-ai.js';

import type { DeploymentTemplate } from './dmlog-ai.js';
import { dmlogAi } from './dmlog-ai.js';
import { fishinglogAi } from './fishinglog-ai.js';
import { deckbossAi } from './deckboss-ai.js';

// ─── Registry ───────────────────────────────────────────────────────────

const DEPLOYMENTS = {
  dmlogAi,
  fishinglogAi,
  deckbossAi,
} as const;

export { DEPLOYMENTS };

/**
 * Get a deployment template by name (kebab-case or camelCase).
 *
 * @example
 * getDeployment('dmlog-ai')    // returns dmlogAi deployment
 * getDeployment('dmlogAi')     // same, camelCase
 */
export function getDeployment(name: string): DeploymentTemplate | undefined {
  const key = name in DEPLOYMENTS
    ? name as keyof typeof DEPLOYMENTS
    : undefined;
  if (key) return DEPLOYMENTS[key];

  // Try kebab-case to camelCase conversion
  const camelCase = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof typeof DEPLOYMENTS;
  return DEPLOYMENTS[camelCase];
}

/**
 * List all available deployment template names.
 */
export function listDeployments(): string[] {
  return Object.keys(DEPLOYMENTS);
}

/**
 * Create a custom deployment template from a base.
 *
 * @example
 * createDeployment({
 *   name: 'My DMlog',
 *   domain: 'my-dm.example.com',
 *   soul: myCustomSoul,
 *   config: { ...dmlogAi.config, llm: { ...dmlogAi.config.llm, model: 'gpt-4' } },
 *   modules: [...dmlogAi.modules, 'custom-module'],
 *   plugins: dmlogAi.plugins,
 *   env: { ...dmlogAi.env },
 *   web: { ...dmlogAi.web, title: 'My Custom DM' },
 * })
 */
export function createDeployment(template: DeploymentTemplate): DeploymentTemplate {
  return template;
}
