import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults to port 4000 and a local data directory', () => {
    const config = loadConfig({});
    expect(config.port).toBe(4000);
    expect(config.dataDir).toMatch(/data$/);
  });

  it('reads OPENCREW_PORT and OPENCREW_DATA_DIR when set', () => {
    const config = loadConfig({ OPENCREW_PORT: '5050', OPENCREW_DATA_DIR: '/tmp/opencrew-data' });
    expect(config.port).toBe(5050);
    expect(config.dataDir).toBe('/tmp/opencrew-data');
  });
});
