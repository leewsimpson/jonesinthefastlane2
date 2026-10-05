/**
 * Runtime config (CD-03). The build contains no environment-specific values: each deploy writes its own
 * `/config.json` next to the same build artifact, so staging and production promote one build.
 */
export type RuntimeConfig = {
  environment: string;
  apiBase: string;
};

function isRuntimeConfig(data: unknown): data is RuntimeConfig {
  if (typeof data !== 'object' || data === null) return false;
  const { environment, apiBase } = data as Record<string, unknown>;
  return typeof environment === 'string' && typeof apiBase === 'string';
}

export async function loadConfig(fetchFn: typeof fetch = fetch): Promise<RuntimeConfig> {
  const res = await fetchFn('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!isRuntimeConfig(data)) throw new Error('config.json: expected { environment, apiBase }');
  return { environment: data.environment, apiBase: data.apiBase.replace(/\/+$/, '') };
}
