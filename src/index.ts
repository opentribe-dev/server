import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { JobRunner } from './jobs/runner.js';
import { SUMMARIZE_CONVERSATION_JOB_TYPE, updateConversationSummary } from './memory/summary.js';
import { createProviderRespond } from './providers/respond.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dataDir);
  runMigrations(db);
  const app = await buildApp({ db, respond: createProviderRespond(db) });

  const jobRunner = new JobRunner(db, {
    [SUMMARIZE_CONVERSATION_JOB_TYPE]: async (jobDb, payload) => {
      const { conversationId } = payload as { conversationId: string };
      await updateConversationSummary(jobDb, conversationId);
    },
  });
  jobRunner.start();

  await app.listen({ port: config.port, host: config.host });
  console.log(`OpenCrew server listening on port ${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
