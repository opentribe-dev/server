import path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.OPENCREW_DATA_DIR ?? path.resolve(process.cwd(), 'data');
  const port = env.OPENCREW_PORT ? Number(env.OPENCREW_PORT) : 4000;
  return { port, dataDir };
}
