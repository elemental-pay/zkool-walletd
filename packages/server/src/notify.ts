import { Agent, fetch as ufetch } from "undici";
import { Client } from "graphql-ws";

import { confirmTransaction, createTxIfNotExists, getAddressByReceiver, getPendingTransactions, storeNotes } from "./db.js";
import { gqlTransactionById } from "./graphql.js";
import { Note, WalletEvent } from "./mempool.js";

export async function notifyTx(
  client: Client,
  txidHex: string,
  notifyTxUrl: string,
  idAccount: number,
  event: WalletEvent["events"],
): Promise<void> {
  const txid = reverseHex(txidHex);

  try {
    if (!event.notes) {
      console.log('[notifyTx] no note found for transaction');
      return;
    }
    const notifyTxids = storeNotes(event.txid, event.height, event.notes);
    console.log({ notifyTxids });
    // const tx = await gqlTransactionById(client, idAccount, txid);
    //   const address = getAddressByReceiver(note.address);
    //   if (!address) {
    //     console.log("[notifyTx] no receiver found for address:", note.address);
    //     return;
    //   }
    
    // console.log(JSON.stringify({ address, memo: note.memo }));
    // createTxIfNotExists(txid, event.height);
    // createTxIfNotExists({
    //   accountId: idAccount,
    //   addressIndex: address.address,
    //   txid,
    //   direction: "pending",
    //   amount: note.value,
    //   fee: 0,
    //   height: 0,
    //   confirmations: 0,
    //   address: note.address ?? undefined,
    // });
  } catch (e) {
    // tx not yet known to the node — upsert a skeleton so it's tracked
    console.warn(`[notifyTx] transactionById failed for ${txid}:`, e);
    // upsertTransfer({
    //   accountId: idAccount,
    //   addressIndex: 0,
    //   txid,
    //   direction: "pending",
    //   amount: 0,
    //   fee: 0,
    //   height: 0,
    //   confirmations: 0,
    // });
  }

  const url = notifyTxUrl + txid;
  console.log(`[notify] tx → ${url}`);
  await getIgnoreErrors(url);
}

/**
 * Mirrors the Rust notify_block: reverses the block hash bytes then
 * hex-encodes, then GETs `${url}${hash}`.
 */
export async function notifyBlock(
  client: Client,
  hash: string,
  notifyBlockUrl: string
): Promise<void> {
  // const hash = reverseHex(hashHex);

  const pending = getPendingTransactions();
  await Promise.allSettled(
    pending.map(async (tx) => {
      // const txid = Buffer.from(tx.txid).reverse().toString("hex");

      try {
        const confirmed = await gqlTransactionById(client, tx.account, tx.txid);

        if (confirmed.height && confirmed.height > 0) {
          confirmTransaction(tx.id_tx, confirmed.height);
          console.log(`[onBlock] confirmed tx ${tx.txid} at height ${confirmed.height}`);
        }
      } catch (err) {
        // Not yet confirmed — leave it pending
        console.warn(`[onBlock] tx ${tx.txid} not yet confirmed:`, err);
      }
    })
  );

  const url = notifyBlockUrl + hash;
  await getIgnoreErrors(url);
}

function reverseHex(hex: string): string {
  // Normalise: strip 0x prefix, ensure even length
  const clean = hex.replace(/^0x/, "").padStart(
    Math.ceil(hex.replace(/^0x/, "").length / 2) * 2,
    "0"
  );
  const bytes: string[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(clean.slice(i, i + 2));
  }
  return bytes.reverse().join("");
}

/**
 * Fires a GET and swallows errors (same behaviour as the Rust impl which
 * only warns on failure and does not propagate).
 * Accepts self-signed certs to match `danger_accept_invalid_certs(true)`.
 */
async function getIgnoreErrors(url: string): Promise<void> {
  try {
    const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    const res = await ufetch(url, { dispatcher });
    if (!res.ok) {
      console.warn(`[notify] non-2xx response ${res.status} from ${url}`);
    }
  } catch (err) {
    console.warn(`[notify] failed to notify ${url}:`, err);
  }
}
