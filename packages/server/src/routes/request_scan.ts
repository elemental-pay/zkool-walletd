import { Router } from "express";
import { Client } from "graphql-ws";
import { gqlSynchronize } from "../graphql.js";
import { getAllAccountIds } from "../db.js";

interface RequestScanRequest {
  account_indices?: number[];
  fast?: boolean;
}

interface RequestScanResponse {
  height: number;
}

export function requestScanRouter(client: Client): Router {
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

      const response: RequestScanResponse = { height };
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
