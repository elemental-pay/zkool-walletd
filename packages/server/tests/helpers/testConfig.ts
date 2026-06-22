import type { AppConfig } from "../../src/config.js";

export const testConfig: AppConfig = {
  wsEndpoint: "ws://localhost:8000/subscriptions",
  port: 3000,
  notifyTxUrl: undefined,
  notifyBlockUrl: undefined,
  watchAccounts: [1],
};
