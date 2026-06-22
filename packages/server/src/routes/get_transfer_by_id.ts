import { Router } from "express";
import { Client } from "graphql-ws";

import { getTransfersByTxid, Transfer } from "../db.js";
import { gqlLatestHeight } from "../graphql.js";
import { AppConfig } from "../config.js";

interface GetTransferByTxidRequest {
  txid: string;
  account_index: number;
}

interface GetTransferByTxidResponse {
  transfer: Transfer;
  transfers: Transfer[];
}

export function getTransferByTxidRouter(
  client: Client,
  cfg: AppConfig,
): Router {
  const router = Router();

  router.post("/get_transfer_by_txid", async (req, res) => {
    try {
      const { txid, account_index }: GetTransferByTxidRequest =
        req.body ?? {};

      if (!txid) {
        res.status(400).json({ error: "txid is required" });
        return;
      }

      if (account_index === undefined) {
        res.status(400).json({ error: "account_index is required" });
        return;
      }

      const latestHeight = await gqlLatestHeight(client);

      const result = getTransfersByTxid(
        txid,
        account_index,
        latestHeight,
        cfg.confirmations
      );

      if (!result) {
        res.status(404).json({ error: `Unknown txid ${txid}` });
        return;
      }
      const { transfer, transfers } = result;

      if (transfers.length === 0) {
        res.status(404).json({ error: `Unknown txid ${txid}` });
        return;
      }

      const response: GetTransferByTxidResponse = {
        transfer,
        transfers,
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
