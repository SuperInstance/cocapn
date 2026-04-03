// Model router — simple round-robin / fallback model selection.
// No Google API dependency.

interface ModelConfig {
  models: string[];
  current: number;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export function selectModel(env: { MODEL_PREFS?: KVNamespace }, repoName: string): string {
  // Return the default; BYOK repos handle model selection via config.
  return DEFAULT_MODEL;
}

export async function rotateModel(env: { MODEL_PREFS?: KVNamespace }, repoName: string, failedModel?: string): Promise<string> {
  if (!env.MODEL_PREFS) return DEFAULT_MODEL;
  const raw = await env.MODEL_PREFS.get(repoName);
  const config: ModelConfig = raw ? JSON.parse(raw) : { models: [DEFAULT_MODEL], current: 0 };
  if (failedModel) {
    config.models = config.models.filter(m => m !== failedModel);
    if (config.models.length === 0) config.models.push(DEFAULT_MODEL);
  }
  config.current = (config.current + 1) % config.models.length;
  await env.MODEL_PREFS.put(repoName, JSON.stringify(config));
  return config.models[config.current];
}
