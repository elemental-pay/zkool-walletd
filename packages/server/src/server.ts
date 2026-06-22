import { makeClient } from "./graphql.js";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { initDb } from "./db.js";

// const WS_ENDPOINT = process.env.WS_ENDPOINT ?? "ws://localhost:8000/subscriptions";
const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main(): Promise<void> {
  const cfg = loadConfig();
  const client = makeClient(cfg.wsEndpoint);

  await initDb();

  createApp(client, cfg)
    .then((app) => {
      app.listen(PORT, () => {
        console.log(`RPC server listening on http://localhost:${PORT}`);
        console.log(`GraphQL backend: ${cfg.wsEndpoint}`);
      });
    })
    .catch((err) => {
      console.error("Fatal:", err);
      process.exit(1);
    });  

  // Graceful shutdown
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, async () => {
      console.log(`\n${sig} received, shutting down…`);
      await client.dispose();
      process.exit(0);
    });
  }
}

main();
