import { Router } from "express";
import { Client } from "graphql-ws";
import { gqlNewAddresses } from "../graphql.js";
import { nextSubAccount, insertAddress, getAccount, insertReceiver } from "../db.js";

interface CreateAddressRequest {
  account_index: number;
  label?: string;
}

interface CreateAddressResponse {
  address: string;
  address_index: number;
}

export function createAddressRouter(client: Client): Router {
  const router = Router();

  router.post("/create_address", async (req, res) => {
    try {
      const { account_index, label }: CreateAddressRequest = req.body ?? {};

      if (account_index == null) {
        res.status(400).json({ error: "account_index is required" });
        return;
      }

      const account = getAccount(account_index);
      if (!account) {
        res.status(404).json({ error: `Account ${account_index} not found` });
        return;
      }

      // Ask the GraphQL server for a fresh diversified address
      const { ua, sapling, orchard } = await gqlNewAddresses(client, account_index);
      console.log({ ua, sapling, orchard })

      const subAccount = nextSubAccount(account_index);
      console.log({ subAccount });
      const idAddress = insertAddress(
        account_index,
        subAccount,
        ua,
        label ?? ""
      );
      // console.log({ idAddress })

      insertReceiver(1, idAddress, sapling);
      insertReceiver(2, idAddress, orchard);
      // insertAddress(account_index, addressIndex, ua, label);

      const response: CreateAddressResponse = {
        address: ua,
        address_index: subAccount,
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
