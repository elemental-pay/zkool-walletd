import { Client } from "graphql-ws";

import { notifyTx, notifyBlock } from "./notify.js";

export type MempoolConfig = {
  notifyTxUrl?: string;
  notifyBlockUrl?: string;
};

export type Note = {
  pool: number,
  scope: number,
  value: number,
  address: string,
  diversifier: string,
  diversifierIndex: number,
  memo: string,
}

export type WalletEvent = {
  events: {
    type: "BLOCK" | "TX" | "DKG";
    height: number;
    txid: string;
    value: number;
    dkgAccount?: number;
    notes?: Note[]
  };
};

export class MempoolWatcher {
  private readonly client: Client;
  private readonly notifyTxUrl: string | undefined;
  private readonly notifyBlockUrl: string | undefined;

  /** accountId → unsubscribe callback returned by client.subscribe */
  private readonly subscriptions = new Map<number, () => void>();

  constructor(client: Client, cfg: MempoolConfig = {}) {
    this.client = client;
    this.notifyTxUrl = cfg.notifyTxUrl;
    this.notifyBlockUrl = cfg.notifyBlockUrl;
  }

  // ── Account registration ──────────────────────────────────────────────────

  addAccount(accountId: number): void {
    if (this.subscriptions.has(accountId)) return;
    const unsubscribe = this.subscribe(accountId);
    this.subscriptions.set(accountId, unsubscribe);
    console.log(`[mempool] subscribed to account ${accountId}`);
  }

  removeAccount(accountId: number): void {
    const unsubscribe = this.subscriptions.get(accountId);
    if (!unsubscribe) return;
    unsubscribe();
    this.subscriptions.delete(accountId);
    console.log(`[mempool] unsubscribed from account ${accountId}`);
  }

  watchedAccounts(): number[] {
    return [...this.subscriptions.keys()];
  }

  stop(): void {
    for (const id of [...this.subscriptions.keys()]) {
      this.removeAccount(id);
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private subscribe(accountId: number): () => void {
    return this.client.subscribe<WalletEvent>(
      {
        query: `subscription Events($id: Int!) {
          events(idAccount: $id) {
            type
            height
            txid
            value
            notes {
                pool
                scope
                value
                address
                diversifier
                diversifierIndex
                memo
            }
          }
        }`,
        variables: { id: accountId },
      },
      {
        next: ({ data }) => {
          if (!data) return;
          this.handleEvent(accountId, data.events);
        },
        error: (err) => {
          console.error(
            `[mempool] subscription error for account ${accountId}:`,
            err
          );
          // graphql-ws will reconnect automatically; re-register on next
          // connection via the "connecting" lifecycle if needed.
        },
        complete: () => {
          console.warn(
            `[mempool] subscription completed for account ${accountId}`
          );
          this.subscriptions.delete(accountId);
        },
      }
    );
  }

  private handleEvent(
    accountId: number,
    event: WalletEvent["events"]
  ): void {
    switch (event.type) {
      case "TX":
        console.log(
          `[mempool] TX  account=${accountId} txid=${event.txid}`
        );
        if (this.notifyTxUrl) {
          notifyTx(this.client, event.txid, this.notifyTxUrl, accountId, event).catch((err) =>
            console.warn("[mempool] notifyTx failed:", err)
          );
        }
        break;

      case "BLOCK":
        // console.log(
        //   `[mempool] BLOCK account=${accountId} height=${event.height} hash=${event.txid}`
        // );
        console.debug({ event })
        if (this.notifyBlockUrl) {
          // The `txid` field carries the block hash for BLOCK events
          notifyBlock(this.client, event.txid, this.notifyBlockUrl).catch((err) =>
            console.warn("[mempool] notifyBlock failed:", err)
          );
        }
        break;

      case "DKG":
        // Not relevant for mempool notifications
        break;
    }
  }
}
