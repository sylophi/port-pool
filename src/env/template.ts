const TOKEN_RE = /\$\{ports\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function findPortReferences(template: string): string[] {
  return Array.from(template.matchAll(TOKEN_RE), (m) => m[1]);
}

export function renderEnv(
  env: Record<string, string>,
  ports: Record<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, template] of Object.entries(env)) {
    result[key] = template.replace(TOKEN_RE, (_match, name) => {
      const port = ports[name];
      if (port === undefined) {
        throw new Error(`env.${key} references unknown port '${name}'`);
      }
      return String(port);
    });
  }
  return result;
}
