import { vi } from "vitest";
import type { Client } from "graphql-ws";

export function createMockClient(): Client {
  return {
    subscribe: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    terminate: vi.fn(),
  } as unknown as Client;
}

export type MockClient = ReturnType<typeof createMockClient>;
