import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { makeClient } from "../../src/graphql.js";
import { integrationConfig } from "../helpers/integrationConfig.js";
import { setupTestDb, teardownTestDb } from "../helpers/testDb.js";
import type { Client } from "graphql-ws";
import Database from "better-sqlite3";

// Increase timeout for live server calls
const TIMEOUT = 15_000;

describe("Integration: POST /create_account", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let client: Client;
  let db: Database.Database;

  beforeAll(async () => {
    db = setupTestDb();
    client = makeClient(integrationConfig.wsEndpoint);
    app = await createApp(client, integrationConfig);
  }, TIMEOUT);

  afterAll(async () => {
    await client.dispose();
    teardownTestDb(db);
  });

  it("creates an account against live GraphQL server", async () => {
    const res = await request(app)
      .post("/create_account")
      .send({ label: "integration-test", key: "some-key" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      account_index: expect.any(Number),
      address: expect.any(String),
    });
  }, TIMEOUT);

  it("creates a second account with a different label", async () => {
    const res = await request(app)
      .post("/create_account")
      .send({ label: "second-account", key: "some-other-key" });

    expect(res.status).toBe(200);
    expect(res.body.account_index).toBeGreaterThan(0);
  }, TIMEOUT);
});