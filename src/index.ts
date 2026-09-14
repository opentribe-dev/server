import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { createProviderRespond } from './providers/respond.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dataDir);
  runMigrations(db);
  const app = await buildApp({ db, respond: createProviderRespond(db) });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`OpenCrew server listening on port ${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
