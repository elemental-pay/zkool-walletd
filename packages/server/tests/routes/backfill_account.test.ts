import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "graphql-ws";

import { backfillAccount } from "../../src/notify.js";
import { createTxIfNotExists, getMaxHeight, storeNotes } from "../../src/db.js";
import { gqlTransactionsByAccount } from "../../src/graphql.js";

vi.mock("../../src/db.js", () => ({
  confirmTransaction: vi.fn(),
  createTxIfNotExists: vi.fn(),
  getAddressByReceiver: vi.fn(),
  getMaxHeight: vi.fn(),
  getPendingTransactions: vi.fn(),
  storeNotes: vi.fn(),
}));

vi.mock("../../src/graphql.js", () => ({
  gqlTransactionById: vi.fn(),
  gqlTransactionsByAccount: vi.fn(),
}));

describe("backfillAccount", () => {
  const client = {} as Client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills only new transactions since local max height", async () => {
    vi.mocked(getMaxHeight).mockReturnValue(77);
    vi.mocked(gqlTransactionsByAccount).mockResolvedValue([
      {
        txid: "tx-new",
        value: 0,
        fee: 0,
        height: 80,
        notes: [
          {
            id: 1,
            height: 80,
            pool: 2,
            value: 10,
            address: "zs1new",
            scope: 0,
            diversifier: "d1",
            diversifierIndex: 0,
            memo: "",
          },
        ],
      },
      {
        txid: "tx-existing",
        value: 0,
        fee: 0,
        height: 79,
        notes: [],
      },
    ]);
    vi.mocked(createTxIfNotExists)
      .mockReturnValueOnce({ id: 1, isNew: true })
      .mockReturnValueOnce({ id: 2, isNew: false });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await backfillAccount(client, 5, "https://notify/");

    expect(gqlTransactionsByAccount).toHaveBeenCalledWith(client, 5, 77);
    expect(createTxIfNotExists).toHaveBeenCalledTimes(2);
    expect(storeNotes).toHaveBeenCalledTimes(1);
    expect(storeNotes).toHaveBeenCalledWith("tx-new", 80, expect.any(Array));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://notify/tx-new",
      expect.any(Object)
    );
  });

  it("does not notify when notifyTxUrl is undefined", async () => {
    vi.mocked(getMaxHeight).mockReturnValue(0);
    vi.mocked(gqlTransactionsByAccount).mockResolvedValue([
      {
        txid: "tx-new",
        value: 0,
        fee: 0,
        height: 1,
        notes: [],
      },
    ]);
    vi.mocked(createTxIfNotExists).mockReturnValue({ id: 1, isNew: true });

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await backfillAccount(client, 1, undefined);

    expect(storeNotes).toHaveBeenCalledWith("tx-new", 1, []);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
