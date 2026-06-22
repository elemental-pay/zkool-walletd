import { Router } from "express";
import { getAddressesByAccount, isAddressUsed } from "../db.js";
import { Client } from "graphql-ws";

interface GetAddressRequest {
  account_index: number;
  address_index?: number[];
}

interface AddressEntry {
  address: string;
  address_index: number;
  label: string;
  used: boolean;
}

interface GetAddressResponse {
  address: string;
  addresses: AddressEntry[];
}

export function getAddressRouter(client: Client): Router {
  const router = Router();

  router.post("/get_address", (req, res) => {
    try {
      const { account_index, address_index }: GetAddressRequest =
        req.body ?? {};

      if (account_index === undefined) {
        res.status(400).json({ error: "account_index is required" });
        return;
      }

      const rows = getAddressesByAccount(account_index, address_index);

      if (rows.length === 0) {
        res.status(404).json({ error: "No addresses found" });
        return;
      }

      const addresses: AddressEntry[] = rows.map((row) => ({
        address: row.address,
        address_index: row.sub_account,
        label: row.label,
        used: isAddressUsed(row.address),
      }));

      // FIXME: Fetch first address also on filter
      // Primary address is always sub_account = 0
      const primary =
        addresses.find((a) => a.address_index === 0) ?? addresses[0];

      const response: GetAddressResponse = {
        address: primary.address,
        addresses,
      };

      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}