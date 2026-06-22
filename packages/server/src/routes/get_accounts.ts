import { Router } from "express";
import { Client } from "graphql-ws";

import { gqlBalanceByAccount } from "../graphql.js";
import { getAllAccounts } from "../db.js";

interface GetAccountsRequest {
  tag?: string;
}

interface AccountBalance {
  account_index: number;
  label: string;
  base_address: string;
  balance: number;
  unlocked_balance: number;
  tag?: string;
}

interface GetAccountsResponse {
  subaddress_accounts: AccountBalance[];
  total_balance: number;
  total_unlocked_balance: number;
}

// Zkool returns BigDecimal balances as integer zatoshi strings (e.g. "12345")
function toZatoshi(raw: string): number {
  return parseInt(raw, 10) || 0;
}

export function getAccountsRouter(client: Client): Router {
  const router = Router();

  router.post("/get_accounts", async (req, res) => {
    try {
      const { tag }: GetAccountsRequest = req.body ?? {};

      let accounts = getAllAccounts();
      console.debug({ accounts })

      if (tag) {
        accounts = accounts.filter((a) => a.label?.startsWith(tag));
      }

      const subaddress_accounts: AccountBalance[] = await Promise.all(
        accounts.map(async (account) => {
          const balance = await gqlBalanceByAccount(client, account.account);

          const total = toZatoshi(balance.total);
          const unlocked =
            toZatoshi(balance.sapling) + toZatoshi(balance.orchard);

          return {
            account_index: account.account,
            label: account.label ?? "",
            base_address: account.address,
            balance: total,
            unlocked_balance: unlocked,
            tag: account.label ?? undefined,
          };
        })
      );

      const total_balance = subaddress_accounts.reduce(
        (s, a) => s + a.balance,
        0
      );
      const total_unlocked_balance = subaddress_accounts.reduce(
        (s, a) => s + a.unlocked_balance,
        0
      );

      const response: GetAccountsResponse = {
        subaddress_accounts,
        total_balance,
        total_unlocked_balance,
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
