import type { AppConfig } from "../../src/config.js";

export const integrationConfig: AppConfig = {
  wsEndpoint: process.env.WS_ENDPOINT ?? "ws://localhost:8000/subscriptions",
  port: 3001,
  notifyTxUrl: undefined,
  notifyBlockUrl: undefined,
  watchAccounts: [1],
};
