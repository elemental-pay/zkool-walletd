// remove mempoolPollMs
export type AppConfig = {
  wsEndpoint: string;
  port: number;
  notifyTxUrl: string | undefined;
  notifyBlockUrl: string | undefined;
  watchAccounts: number[];
  confirmations: number;
};

export function loadConfig(): AppConfig {
  const raw = process.env.WATCH_ACCOUNTS ?? "1";
  const watchAccounts = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  return {
    wsEndpoint:
      process.env.WS_ENDPOINT ?? "ws://localhost:8000/subscriptions",
    port: parseInt(process.env.PORT ?? "3000", 10),
    notifyTxUrl: process.env.NOTIFY_TX_URL,
    notifyBlockUrl: process.env.NOTIFY_BLOCK_URL || 'test.localhost',
    watchAccounts,
    confirmations: parseInt(process.env.CONFIRMATIONS ?? "10", 10),
  };
}