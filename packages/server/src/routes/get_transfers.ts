import { Router } from "express";
import { Client } from "graphql-ws";

import { getAccount, getTransfers } from "../db.js";
import { gqlLatestHeight, gqlTransactionsByAccount } from "../graphql.js";
import { Transfer } from "../db.js";

interface SubaddrIndex {
  major: number;
  minor: number;
}

interface GetTransfersRequest {
  account_index: number;
  subaddr_indices?: number[];   // minor indices to filter; omit = all
  in?: boolean;
  out?: boolean;
  pending?: boolean;
  pool?: boolean;
  min_height?: number;
  max_height?: number;
  filter_by_height?: boolean;
}

interface GetTransfersResponse {
  in?: Transfer[];
  out?: Transfer[];
  pending?: Transfer[];
  pool?: Transfer[];
}

export function getTransfersRouter(
  client: Client,
  confirmations: number
): Router {
  const router = Router();

  router.post("/get_transfers", async (req, res) => {
    try {
      const {
        account_index,
        subaddr_indices = [],
        in: wantIn = true,
        out: wantOut = true,
        pending: wantPending = true,
        pool: wantPool = true,
        min_height,
        max_height,
        filter_by_height = false,
      }: GetTransfersRequest = req.body ?? {};

      if (account_index == null) {
        res.status(400).json({ error: "account_index is required" });
        return;
      }

      const account = getAccount(account_index);
      if (!account) {
        res.status(404).json({ error: `Account ${account_index} not found` });
        return;
      }

      const latestHeight = await gqlLatestHeight(client);

      // Sync from GraphQL into local DB before reading
      // const gqlTxs = await gqlTransactionsByAccount(
      //   client,
      //   account_index,
      //   filter_by_height ? min_height : undefined
      // );
      // upsertGqlTransactions(gqlTxs);

      // Read from local DB — already has correct Transfer shape
      let transfers = getTransfers(
        account_index,
        subaddr_indices,
        latestHeight,
        confirmations
      );
      // console.log(transfers[0].txid)

      // Apply height filters post-query if requested
      if (filter_by_height) {
        if (min_height != null) {
          transfers = transfers.filter((t) => t.height >= min_height!);
        }
        if (max_height != null) {
          transfers = transfers.filter((t) => t.height <= max_height!);
        }
      }

      // Bucket by type — your DB fn already sets type: "in",
      // extend getTransfers for "out"/"pending" when you add spends
      const response: GetTransfersResponse = {};

      if (wantIn) {
        response.in = aggregateByTxid(
          transfers.filter((t) => t.type === "in")
        );
      }
      if (wantOut) {
        response.out = aggregateByTxid(
          transfers.filter((t) => t.type === "out")
        );
      }
      if (wantPending) {
        response.pending = aggregateByTxid(
          transfers.filter((t) => t.type === "pending")
        );
      }
      if (wantPool) {
        response.pool = aggregateByTxid(
          transfers.filter((t) => t.type === "pool")
        );
      }

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function aggregateByTxid(transfers: Transfer[]): Transfer[] {
  // Group by txid
  const byTxid = new Map<string, Transfer[]>();
  for (const t of transfers) {
    const group = byTxid.get(t.txid) ?? [];
    group.push(t);
    byTxid.set(t.txid, group);
  }

  return Array.from(byTxid.values()).map((group) => {
    if (group.length === 1) return group[0];

    // Within a txid, collapse notes per diversified address
    const byAddress = new Map<string, Transfer[]>();
    for (const t of group) {
      const addrGroup = byAddress.get(t.address) ?? [];
      addrGroup.push(t);
      byAddress.set(t.address, addrGroup);
    }

    const amounts = Array.from(byAddress.values()).map((addrGroup) =>
      addrGroup.reduce((sum, t) => sum + t.amount, 0)
    );

    const totalAmount = amounts.reduce((sum, a) => sum + a, 0);

    // Primary transfer takes the first address (lowest sub_account),
    // total amount and the per-address breakdown in amounts[]
    return {
      ...group[0],
      amount: totalAmount,
      amounts,
    };
  });
}
