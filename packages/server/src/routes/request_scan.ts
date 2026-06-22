import { Router } from "express";
import { Client } from "graphql-ws";
import { gqlSynchronize } from "../graphql.js";
import { getAllAccountIds } from "../db.js";
import { backfillAccount } from "../notify.js";
import { AppConfig } from "../config.js";

interface RequestScanRequest {
  account_indices?: number[];
  fast?: boolean;
}

interface RequestScanResponse {
  height: number;
}

export function requestScanRouter(client: Client, cfg: AppConfig): Router {
  const router = Router();

  router.post("/request_scan", async (req, res) => {
    try {
      const { account_indices, fast }: RequestScanRequest = req.body ?? {};

      // Fall back to all known accounts if none specified
      const accounts = account_indices ?? getAllAccountIds();
      console.log({ accounts })

      if (accounts.length === 0) {
        res.status(400).json({ error: "No accounts to sync" });
        return;
      }

      const height = await gqlSynchronize(client, accounts, fast);
      const backfillResults = await Promise.allSettled(
        accounts.map((id) => backfillAccount(client, id, cfg.notifyTxUrl))
      );
      backfillResults.forEach((result, index) => {
        if (result.status === "rejected") {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          console.warn("[request_scan] backfill failed", {
            account: accounts[index],
            error: message,
          });
        }
      });

      const response: RequestScanResponse = { height };
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
