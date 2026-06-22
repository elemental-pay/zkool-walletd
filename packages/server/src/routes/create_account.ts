import { Router } from "express";
import { Client } from "graphql-ws";
import {
  gqlCreateAccount,
  gqlAddressByAccount,
} from "../graphql.js";
import { insertAccount, insertAddress, insertReceiver } from "../db.js";

interface CreateAccountRequest {
  key: string;
  label?: string;
  height: number;
}

interface CreateAccountResponse {
  account_index: number;
  address: string;
}

export function createAccountRouter(client: Client): Router {
  const router = Router();

  router.post("/create_account", async (req, res) => {
    try {
      const { label, key, height }: CreateAccountRequest = req.body ?? {};
      console.debug({ label, height })

      const idAccount = await gqlCreateAccount(client, {
        name: label ?? "",
        key,
        aindex: 0,
        birth: height,
        useInternal: true,
      });

      const { ua, sapling, orchard } = await gqlAddressByAccount(client, idAccount);

      insertAccount(idAccount, ua, label);

      const idAddress = insertAddress(idAccount, 0, ua, label ?? "");

      insertReceiver(1, idAddress, sapling);
      insertReceiver(2, idAddress, orchard);

      const response: CreateAccountResponse = {
        account_index: idAccount,
        address: ua,
      };

      res.json(response);
    } catch (err: any) {
      console.error(err)
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
