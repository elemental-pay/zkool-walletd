import Database from "better-sqlite3";
import path from "path";

import { Note } from "./mempool.js";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "wallet.db");

// const db = new Database(DB_PATH);

let db: Database.Database = new Database(DB_PATH);

export function initDb(instance?: Database.Database) {
  if (instance) {
    db = instance;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      height INTEGER PRIMARY KEY,
      hash   BLOB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      account INTEGER PRIMARY KEY,
      label   TEXT    NOT NULL DEFAULT '',
      address TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id_address        INTEGER PRIMARY KEY AUTOINCREMENT,
      label             TEXT    NOT NULL DEFAULT '',
      account           INTEGER NOT NULL,
      sub_account       INTEGER NOT NULL,
      address           TEXT    NOT NULL,
      diversifier_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receivers (
      id_receiver      INTEGER PRIMARY KEY AUTOINCREMENT,
      pool             INTEGER NOT NULL,
      id_address       INTEGER NOT NULL REFERENCES addresses(id_address),
      receiver_address TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id_tx  INTEGER PRIMARY KEY AUTOINCREMENT,
      txid   TEXT    NOT NULL UNIQUE,
      height INTEGER NOT NULL,
      value  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS received_notes (
      id_note     INTEGER PRIMARY KEY AUTOINCREMENT,
      address     TEXT    NOT NULL,
      account     INTEGER,
      sub_account INTEGER,
      id_tx       INTEGER NOT NULL REFERENCES transactions(id_tx),
      position    INTEGER NOT NULL,
      height      INTEGER NOT NULL,
      diversifier TEXT    NOT NULL,
      value       INTEGER NOT NULL,
      memo        TEXT    NOT NULL DEFAULT '',
      spent       INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_received_notes_account
      ON received_notes(account);
    CREATE INDEX IF NOT EXISTS idx_received_notes_tx
      ON received_notes(id_tx);
    CREATE INDEX IF NOT EXISTS idx_transactions_height
      ON transactions(height);
    CREATE INDEX IF NOT EXISTS idx_receivers_address
      ON receivers(receiver_address);
  `);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AccountRow {
  account: number;
  label: string;
  address: string;
}

export interface AddressRow {
  id_address: number;
  label: string;
  account: number;
  sub_account: number;
  address: string;
  diversifier_index: number;
}

export interface ReceiverRow {
  id_receiver: number;
  pool: number;
  id_address: number;
  receiver_address: string;
}

export interface TransactionRow {
  id_tx: number;
  txid: Buffer;
  height: number;
  value: number;
}

export interface ReceivedNoteRow {
  id_note: number;
  address: string;
  account: number | null;
  sub_account: number | null;
  id_tx: number;
  position: number;
  height: number;
  diversifier: Buffer;
  value: number;
  rcm: Buffer;
  nf: Buffer;
  rho: Buffer | null;
  memo: string;
  spent: number | null;
}

export interface TransferAmount {
  address: string;
  amount: number;
  subaddr_index: { major: number; minor: number };
}

export interface Transfer {
  address: string;
  amount: number;
  amounts?: number[];
  confirmations: number;
  height: number;
  fee: number;
  note: string;
  payment_id: string;
  subaddr_index: { major: number; minor: number };
  suggested_confirmations_threshold: number;
  timestamp: number;
  txid: string;
  type: string;
  unlock_time: number;
}

export interface AccountBalance {
  account: number;
  label: string;
  balance: number;
  unlocked_balance: number;
  base_address: string;
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export function insertBlock(height: number, hash: Buffer): void {
  db.prepare(`INSERT INTO blocks(height, hash) VALUES (?, ?)`).run(
    height,
    hash
  );
}

export function getMaxHeight(): number {
  const row = db
    .prepare(`SELECT MAX(height) AS h FROM blocks`)
    .get() as { h: number | null };
  return row.h ?? 0;
}

export function getBlockHash(height: number): Buffer | undefined {
  const row = db
    .prepare(`SELECT hash FROM blocks WHERE height = ?`)
    .get(height) as { hash: Buffer } | undefined;
  return row?.hash;
}

export function truncateHeight(height: number): void {
  db.prepare(`DELETE FROM transactions WHERE height >= ?`).run(height);
  db.prepare(`DELETE FROM received_notes WHERE height >= ?`).run(height);
  db.prepare(`DELETE FROM blocks WHERE height >= ?`).run(height);
  db.prepare(
    `UPDATE received_notes SET spent = NULL WHERE spent >= ?`
  ).run(height);
}

export function insertAccount(
  account: number,
  address: string,
  label = ""
): void {
  db.prepare(
    `INSERT INTO accounts (account, address, label) VALUES (?, ?, ?)`
  ).run(account, address, label);
}


export function getAccount(account: number): AccountRow | undefined {
  return db
    .prepare(`SELECT account, label, address FROM accounts WHERE account = ?`)
    .get(account) as AccountRow | undefined;
}

export function getAllAccounts(): AccountRow[] {
  return db
    .prepare(`SELECT account, label, address FROM accounts ORDER BY account`)
    .all() as AccountRow[];
}

export function getMaxAccount(): number | null {
  const row = db
    .prepare(`SELECT MAX(account) AS a FROM accounts`)
    .get() as { a: number | null };
  return row.a;
}

// ── Addresses ─────────────────────────────────────────────────────────────────

export function insertAddress(
  account: number,
  subAccount: number,
  address: string,
  label = ""
): number {
  const result = db
    .prepare(
      `INSERT INTO addresses (label, account, sub_account, address, diversifier_index)
       VALUES (?, ?, ?, ?, 0)`
    )
    .run(label, account, subAccount, address);
  return Number(result.lastInsertRowid);
}

export function getAddressesByAccount(
  account: number,
  subAccounts?: number[]
): AddressRow[] {
  if (subAccounts && subAccounts.length > 0) {
    const placeholders = subAccounts.map(() => "?").join(", ");
    return db
      .prepare(
        `SELECT id_address, label, account, sub_account, address
         FROM addresses
         WHERE account = ? AND sub_account IN (${placeholders})`
      )
      .all(account, ...subAccounts) as AddressRow[];
  }

  return db
    .prepare(
      `SELECT id_address, label, account, sub_account, address
       FROM addresses
       WHERE account = ?`
    )
    .all(account) as AddressRow[];
}

export function getAllAccountIds(): number[] {
  return db
    .prepare("SELECT account FROM accounts")
    .all()
    .map((row: any) => row.account);
}

export function isAddressUsed(address: string): boolean {
  const row = db
    .prepare(`SELECT 1 FROM received_notes WHERE address = ? LIMIT 1`)
    .get(address);
  return row !== undefined;
}

export function nextSubAccount(account: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(sub_account), -1) + 1 AS next
       FROM addresses WHERE account = ?`
    )
    .get(account) as { next: number };
  return row.next;
}

export function getMaxSubAccount(account: number): number | null {
  const row = db
    .prepare(
      `SELECT MAX(sub_account) AS s FROM addresses WHERE account = ?`
    )
    .get(account) as { s: number | null };
  return row.s;
}

// ── Receivers ─────────────────────────────────────────────────────────────────

export function insertReceiver(
  pool: number,
  idAddress: number,
  receiverAddress: string
): void {
  db.prepare(
    `INSERT INTO receivers (pool, id_address, receiver_address)
     VALUES (?, ?, ?)`
  ).run(pool, idAddress, receiverAddress);
}

/**
 * Look up the full address row for a given receiver address (replaces
 * getAddressByDiversifier in the notify path).
 */
export function getAddressByReceiver(
  receiverAddress: string
): AddressRow | undefined {
  return db
    .prepare(
      `SELECT a.id_address, a.label, a.account, a.sub_account,
              a.address, a.diversifier_index
       FROM addresses a
       JOIN receivers r ON a.id_address = r.id_address
       WHERE r.receiver_address = ?`
    )
    .get(receiverAddress) as AddressRow | undefined;
}

// ── Transactions ──────────────────────────────────────────────────────────────

/**
 * Returns [id_tx, isNew]. Mirrors Rust's create_tx_if_not_exists.
 */
export function createTxIfNotExists(
  txid: string,
  height: number
): { id: number; isNew: boolean } {
  const existing = db
    .prepare(`SELECT id_tx FROM transactions WHERE txid = ?`)
    .get(txid) as { id_tx: number } | undefined;

  if (existing) return { id: existing.id_tx, isNew: false };

  const result = db
    .prepare(
      `INSERT INTO transactions (txid, height, value) VALUES (?, ?, 0)`
    )
    .run(txid, height);

  return { id: Number(result.lastInsertRowid), isNew: true };
}

export function getTransactionsByAccount(account: number): TransactionRow[] {
  return db
    .prepare(
      `SELECT t.id_tx, t.txid, t.height, t.value
       FROM transactions t
       JOIN received_notes n ON n.id_tx = t.id_tx
       WHERE n.account = ?
       GROUP BY t.id_tx
       ORDER BY t.height DESC`
    )
    .all(account) as TransactionRow[];
}

// ── Received Notes ────────────────────────────────────────────────────────────

export function insertReceivedNote(
  note: Omit<ReceivedNoteRow, "id_note">
): void {
  db.prepare(
    `INSERT INTO received_notes
       (address, account, sub_account, id_tx, position, height,
        diversifier, value, rcm, nf, rho, memo, spent)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'',0)`
  ).run(
    note.address,
    note.account,
    note.sub_account,
    note.id_tx,
    note.position,
    note.height,
    note.diversifier,
    note.value,
    note.rcm,
    note.nf,
    note.rho ?? null
  );
}

export function markNoteSpent(nf: Buffer): void {
  db.prepare(`UPDATE received_notes SET spent = 1 WHERE nf = ?`).run(nf);
}

export function updateMemo(nf: Buffer, memo: string): void {
  db.prepare(`UPDATE received_notes SET memo = ? WHERE nf = ?`).run(
    memo,
    nf
  );
}

export function addTxValue(txid: Buffer, delta: number): void {
  db.prepare(
    `UPDATE transactions SET value = value + ? WHERE txid = ?`
  ).run(delta, txid);
}

// ── Transfers (derived) ───────────────────────────────────────────────────────

export function getTransfers(
  account: number,
  subAccounts: number[],
  latestHeight: number,
  confirmations: number
): Transfer[] {
  const placeholders = subAccounts.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `SELECT a.address, n.value, n.sub_account, t.txid, n.memo, n.height
       FROM received_notes n
       JOIN transactions t ON n.id_tx = t.id_tx
       JOIN receivers r ON n.address = r.receiver_address
       JOIN addresses a ON a.id_address = r.id_address
       WHERE n.account = ?
       ${subAccounts.length > 0 ? `AND n.sub_account IN (${placeholders})` : ""}
       ORDER BY n.height`
    )
    .all(account, ...subAccounts) as Array<{
    address: string;
    value: number;
    sub_account: number;
    txid: string;
    memo: string;
    height: number;
  }>;

  return rows.map((row) => {
    console.log(row.txid)
    // const txid = Buffer.from(row.txid).reverse().toString("hex");
    // console.log(txid)
    const confirmationCount = latestHeight - row.height + 1;

    return {
      address: row.address,
      amount: row.value,
      // amounts: [
      //   {
      //     address: row.address,
      //     amount: row.value,
      //     subaddr_index: { major: account, minor: row.sub_account },
      //   },
      // ],
      confirmations: confirmationCount,
      height: row.height,
      fee: 0,
      note: row.memo,
      payment_id: "",
      subaddr_index: { major: account, minor: row.sub_account },
      suggested_confirmations_threshold: confirmations,
      timestamp: 0,
      txid: row.txid,
      type: "in" as const,
      unlock_time: 0,
    };
  });
}

export function getTransfersByTxid(
  txid: string,
  accountIndex: number,
  latestHeight: number,
  confirmations: number
): { transfer: Transfer; transfers: Transfer[] } | null {
  // const txidBuf = Buffer.from(txid, "hex");
  // const reversedTxid = Buffer.from(txidBuf).reverse();

  const rows = db
    .prepare(
      `SELECT a.address, n.value, n.sub_account, t.txid, n.memo, n.height
       FROM received_notes n
       JOIN transactions t ON n.id_tx = t.id_tx
       JOIN receivers r ON n.address = r.receiver_address
       JOIN addresses a ON a.id_address = r.id_address
       WHERE t.txid = ?
       ORDER BY n.height`
    )
    .all(txid) as {
      address: string;
      value: number;
      sub_account: number;
      txid: Buffer;
      memo: string;
      height: number;
    }[];

  if (rows.length === 0) return null;

  const outTxid = Buffer.from(rows[0].txid).reverse().toString("hex");
  const height = rows[0].height;
  const confirmationCount = height === 0 ? 0 : (latestHeight - height + 1);

  const transfers: Transfer[] = rows.map((row) => ({
    address: row.address,
    amount: row.value,
    // amounts: [row.value,
    //     subaddr_index: { major: accountIndex, minor: row.sub_account },
    //   },
    // ],
    confirmations: confirmationCount,
    height,
    fee: 0,
    note: row.memo,
    payment_id: "",
    subaddr_index: { major: accountIndex, minor: row.sub_account },
    suggested_confirmations_threshold: confirmations,
    timestamp: 0,
    txid: outTxid,
    type: "in",
    unlock_time: 0,
  }));

  const totalAmount = transfers.reduce((sum, t) => sum + t.amount, 0);

  const transfer: Transfer = {
    ...transfers[0],
    amount: totalAmount,
    amounts: transfers.map((t) => t.amount),
  };

  return { transfer, transfers };
}

// ── Balances (derived) ────────────────────────────────────────────────────────

export function getAccountBalances(
  latestHeight: number,
  confirmations: number
): AccountBalance[] {
  const confirmedHeight = latestHeight - confirmations + 1;

  return db
    .prepare(
      `WITH base AS (
         SELECT account, address FROM addresses WHERE sub_account = 0
       ),
       balances AS (
         SELECT account, SUM(value) AS total
         FROM received_notes WHERE spent IS NULL GROUP BY account
       ),
       unlocked AS (
         SELECT account, SUM(value) AS unlocked
         FROM received_notes
         WHERE spent IS NULL AND height <= ?
         GROUP BY account
       )
       SELECT a.account, a.label, b.total, COALESCE(u.unlocked, 0) AS unlocked,
              base.address AS base_address
       FROM addresses a
       JOIN balances b ON a.account = b.account
       LEFT JOIN unlocked u ON u.account = a.account
       JOIN base ON base.account = a.account
       GROUP BY a.account`
    )
    .all(confirmedHeight) as AccountBalance[];
}

export function getNullifiers(): Array<{ nf: Buffer; value: number }> {
  return db
    .prepare(
      `SELECT nf, value FROM received_notes WHERE spent IS NULL OR spent = 0`
    )
    .all() as Array<{ nf: Buffer; value: number }>;
}

function resolveOrCreateAddress(
  note: Note
): { account: number; subAccount: number } {
  const existing = db
    .prepare(
      `SELECT a.account, a.sub_account
       FROM addresses a
       JOIN receivers r ON a.id_address = r.id_address
       WHERE r.receiver_address = ?`
    )
    .get(note.address) as { account: number; sub_account: number } | undefined;

  if (existing) {
    return { account: existing.account, subAccount: existing.sub_account };
  }

  // No existing address — create a new one under the next available slot
  const maxAccountRow = db
    .prepare(`SELECT MAX(account) AS max_account FROM addresses`)
    .get() as { max_account: number | null };

  const account = maxAccountRow.max_account ?? 0;

  const maxSubAccountRow = db
    .prepare(
      `SELECT MAX(sub_account) AS max_sub FROM addresses WHERE account = ?`
    )
    .get(account) as { max_sub: number | null };

  const subAccount =
    maxSubAccountRow.max_sub != null ? maxSubAccountRow.max_sub + 1 : 0;

  const insertAddress = db
    .prepare(
      `INSERT INTO addresses
         (label, account, sub_account, address, diversifier_index)
       VALUES ('', ?, ?, ?, ?)`
    )
    .run(
      account,
      subAccount,
      note.address,
      note.diversifierIndex ?? 0
    );

  const idAddress = Number(insertAddress.lastInsertRowid);

  db.prepare(
    `INSERT INTO receivers (pool, id_address, receiver_address)
     VALUES (?, ?, ?)`
  ).run(note.pool, idAddress, note.address);

  return { account, subAccount };
}

export interface ReceivedNote {
  // txid: string;
  // height: number;
  address: string;
  pool: number;
  position: number;
  diversifier: string;
  diversifierIndex?: number;
  value: bigint;
}

export function handleReceivedNote(txid: string, height: number, note: Note): string | null {
  const { id: idTx, isNew } = createTxIfNotExists(txid, height);

  const { account, subAccount } = resolveOrCreateAddress(note);

  db.prepare(
    `INSERT INTO received_notes
      (address, account, sub_account, id_tx, position, height,
       diversifier, value, memo, spent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0)`
  ).run(
    note.address,
    account,
    subAccount,
    idTx,
    0,
    height,
    note.diversifier,
    note.value,
  );

  db.prepare(
    `UPDATE transactions SET value = value + ? WHERE txid = ?`
  ).run(note.value, txid);

  return isNew ? txid : null;
}

export function storeNotes(txid: string, height: number, notes: Note[]) {
  const notifyTxids: string[] = [];

  const runBatch = db.transaction((notes: Note[]) => {
    for (const note of notes) {
      const newTxid = handleReceivedNote(txid, height, note);
      if (newTxid) notifyTxids.push(newTxid);
    }
  });
  runBatch(notes);

  return notifyTxids;
}

export interface PendingTransaction {
  id_tx: number;
  txid: string;
  account: number;
}

export function getPendingTransactions(): PendingTransaction[] {
  return db
    .prepare(
      `SELECT DISTINCT t.id_tx, t.txid, n.account
       FROM transactions t
       JOIN received_notes n ON n.id_tx = t.id_tx
       WHERE t.height = 0`
    )
    .all() as PendingTransaction[];
}

export function confirmTransaction(id_tx: number, height: number): void {
  db.prepare(
    `UPDATE transactions SET height = ? WHERE id_tx = ?`
  ).run(height, id_tx);

  db.prepare(
    `UPDATE received_notes SET height = ? WHERE id_tx = ?`
  ).run(height, id_tx);
}
