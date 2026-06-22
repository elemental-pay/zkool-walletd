import Database from "better-sqlite3";
import fs from "fs";

import { initDb } from "../../src/db";

// const TEST_DB_PATH = "./test.db";
const TEST_DB_PATH = ":memory:";

export function setupTestDb(): Database.Database {
  // if (fs.existsSync(TEST_DB_PATH)) {
  //   fs.unlinkSync(TEST_DB_PATH);
  // }

  const db = new Database(TEST_DB_PATH);

  // Run your schema migrations/setup here
  initDb(db)

  return db;
}

export function teardownTestDb(db: Database.Database): void {
  db.close();
  // if (fs.existsSync(TEST_DB_PATH)) {
  //   fs.unlinkSync(TEST_DB_PATH);
  // }
}