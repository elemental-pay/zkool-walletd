import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { createMockClient } from "../helpers/mockClient";
import { gqlCreateAccount, gqlAddressByAccount } from "../../src/graphql.js";
import { insertAccount, insertAddress, insertReceiver } from "../../src/db.js";
import { testConfig } from "../helpers/testConfig.js";



vi.mock("../../src/db.js", () => ({
  insertAccount: vi.fn(),
  insertAddress: vi.fn().mockReturnValue(1),
  insertReceiver: vi.fn(),
  // mock any other db exports your app initialises
}));

// Mock the GraphQL helpers
vi.mock("../../src/graphql.js", () => ({
  gqlCreateAccount: vi.fn(),
  gqlAddressByAccount: vi.fn(),
}));

describe("POST /create_account", () => {
  let client: ReturnType<typeof createMockClient>;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    client = createMockClient();
    app = await createApp(client, testConfig);
  });

  it("creates an account and returns account_index and address", async () => {
    vi.mocked(gqlCreateAccount).mockResolvedValueOnce(42);
    vi.mocked(gqlAddressByAccount).mockResolvedValueOnce({
      transparent: "t...",
      ua: "u1abc...",
      sapling: "zs1abc...",
      orchard: "orchard1abc...",
    });
    vi.mocked(insertAddress).mockReturnValueOnce(99);

    const res = await request(app)
      .post("/create_account")
      .send({ label: "my-wallet", key: "some-key" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      account_index: 42,
      address: "u1abc...",
    });

    expect(gqlCreateAccount).toHaveBeenCalledWith(
      client,
      { name: "my-wallet", key: "some-key", aindex: 0, useInternal: true }
    );
    expect(gqlAddressByAccount).toHaveBeenCalledWith(client, 42);
    expect(insertAccount).toHaveBeenCalledWith(42, "u1abc...", "my-wallet");
    expect(insertAddress).toHaveBeenCalledWith(42, 0, "u1abc...", "my-wallet");
    expect(insertReceiver).toHaveBeenCalledWith(1, 99, "zs1abc...");
    expect(insertReceiver).toHaveBeenCalledWith(2, 99, "orchard1abc...");
  });

  it("defaults label to empty string when omitted", async () => {
    vi.mocked(gqlCreateAccount).mockResolvedValueOnce(1);
    vi.mocked(gqlAddressByAccount).mockResolvedValueOnce({
      transparent: "t...",
      ua: "u1def...",
      sapling: "zs1def...",
      orchard: "orchard1def...",
    });

    const res = await request(app)
      .post("/create_account")
      .send({ key: "some-key" });

    expect(res.status).toBe(200);
    expect(gqlCreateAccount).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ name: "" })
    );
    expect(insertAccount).toHaveBeenCalledWith(1, "u1def...", undefined);
    expect(insertAddress).toHaveBeenCalledWith(1, 0, "u1def...", "");
  });

  it("returns 500 when gqlCreateAccount throws", async () => {
    vi.mocked(gqlCreateAccount).mockRejectedValueOnce(new Error("GQL error"));

    const res = await request(app)
      .post("/create_account")
      .send({ label: "test", key: "some-key" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "GQL error" });
  });

  it("returns 500 when gqlAddressByAccount throws", async () => {
    vi.mocked(gqlCreateAccount).mockResolvedValueOnce(1);
    vi.mocked(gqlAddressByAccount).mockRejectedValueOnce(
      new Error("Address lookup failed")
    );

    const res = await request(app)
      .post("/create_account")
      .send({ label: "test", key: "some-key" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Address lookup failed" });
  });

  it("returns 500 when a DB insert throws", async () => {
    vi.mocked(gqlCreateAccount).mockResolvedValueOnce(1);
    vi.mocked(gqlAddressByAccount).mockResolvedValueOnce({
      transparent: "t...",
      ua: "u1abc...",
      sapling: "zs1abc...",
      orchard: "orchard1abc...",
    });
    vi.mocked(insertAccount).mockImplementationOnce(() => {
      throw new Error("DB constraint violation");
    });

    const res = await request(app)
      .post("/create_account")
      .send({ label: "test", key: "some-key" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "DB constraint violation" });
  });
});
