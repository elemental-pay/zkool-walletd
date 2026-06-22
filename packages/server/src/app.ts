import express, { Express } from "express";
import { Client } from "graphql-ws";

import { makeClient } from "./graphql.js";
import { createAccountRouter } from "./routes/create_account.js";
import { createAddressRouter } from "./routes/create_address.js";
import { getAccountsRouter } from "./routes/get_accounts.js";
import { AppConfig, loadConfig } from "./config.js";
import { MempoolWatcher } from "./mempool.js";
import { getAddressRouter } from "./routes/get_address.js";
import { getTransferByTxidRouter } from "./routes/get_transfer_by_id.js";
import { requestScanRouter } from "./routes/request_scan.js";
import { getTransfersRouter } from "./routes/get_transfers.js";

// const WS_ENDPOINT = process.env.WS_ENDPOINT ?? "ws://localhost:8000/subscriptions";

export async function createApp(client: Client, cfg: AppConfig): Promise<Express> {
  // const client = makeClient(WS_ENDPOINT);

  const mempool = new MempoolWatcher(client, {
    notifyTxUrl: cfg.notifyTxUrl,
    notifyBlockUrl: cfg.notifyBlockUrl,
    // pollIntervalMs: cfg.mempoolPollMs,
  });

  // Watch any accounts declared at startup
  for (const id of cfg.watchAccounts) {
    console.log({ id })
    mempool.addAccount(id);
  }
  // mempool.start();

  const app = express();
  app.use(express.json());

  app.use(createAccountRouter(client));
  app.use(createAddressRouter(client));
  app.use(getAccountsRouter(client));
  app.use(getAddressRouter(client));
  app.use(getTransferByTxidRouter(client, cfg));
  app.use(requestScanRouter(client, cfg));
  app.use(getTransfersRouter(client, cfg));

  return app;
}