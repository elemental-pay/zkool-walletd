// src/graphql.ts
import { createClient, Client } from "graphql-ws";
import WebSocket from "ws";

export function makeClient(url: string): Client {
  return createClient({
    url,
    webSocketImpl: WebSocket,
    shouldRetry: () => true,
  });
}

export async function gql<T = any>(
  client: Client,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const iter = client.iterate({ query, variables });
  const result = await iter.next();

  if (result.done) {
    throw new Error("GraphQL iterator completed with no data");
  }

  const { data, errors } = result.value as any;

  if (!data) {
    const msg =
      errors?.map((e: any) => e.message).join(", ") ?? "unknown error";
    throw new Error(`GraphQL error: ${msg}`);
  }

  return data as T;
}

// ── Typed wrappers ────────────────────────────────────────────────────────────

export async function gqlCreateAccount(
  client: Client,
  account: {
    name: string;
    key: string;
    aindex: number;
    birth?: number;
    useInternal?: boolean;
  }
): Promise<number> {
  const data = await gql<{ createAccount: number }>(
    client,
    `mutation CreateAccount($account: NewAccount!) {
      createAccount(newAccount: $account)
    }`,
    { account }
  );
  return data.createAccount;
}

export async function gqlSynchronize(
  client: Client,
  accounts: number[],
  fast?: boolean
): Promise<number> {
  const data = await gql<{ synchronize: number }>(
    client,
    `mutation Synchronize($accounts: [Int!]!, $fast: Boolean) {
      synchronize(idAccounts: $accounts, fast: $fast)
    }`,
    { accounts, fast }
  );
  return data.synchronize;
}

export async function gqlAddressByAccount(
  client: Client,
  idAccount: number
): Promise<{ ua: string; transparent: string; sapling: string, orchard: string }> {
  const data = await gql<{
    addressByAccount: { ua: string; transparent: string; sapling: string, orchard: string };
  }>(
    client,
    `query AddressByAccount($idAccount: Int!) {
      addressByAccount(idAccount: $idAccount) {
        ua
        transparent
        sapling
        orchard
      }
    }`,
    { idAccount }
  );
  return data.addressByAccount;
}

export async function gqlNewAddresses(
  client: Client,
  idAccount: number
): Promise<{ ua: string; transparent: string; sapling: string, orchard: string }> {
  const data = await gql<{
    newAddresses: { ua: string; transparent: string; sapling: string, orchard: string };
  }>(
    client,
    `mutation NewAddresses($idAccount: Int!) {
      newAddresses(idAccount: $idAccount) {
        ua
        transparent
        sapling
        orchard
      }
    }`,
    { idAccount }
  );
  return data.newAddresses;
}

export interface Balance {
  height: number | null;
  transparent: string;
  sapling: string;
  orchard: string;
  total: string;
}

export async function gqlBalanceByAccount(
  client: Client,
  idAccount: number
): Promise<Balance> {
  const data = await gql<{ balanceByAccount: Balance }>(
    client,
    `query BalanceByAccount($idAccount: Int!) {
      balanceByAccount(idAccount: $idAccount) {
        height
        transparent
        sapling
        orchard
        total
      }
    }`,
    { idAccount }
  );
  return data.balanceByAccount;
}

interface Note {
  id: number,
  height: number,
  pool: number,
  value: number,
  address: string,
  scope: number,
  diversifier: string,
  diversifierIndex: number,
  memo: string,
  // tx: Transaction!
}

export interface GqlTransaction {
  txid: string;
  value: number;
  fee: number;
  height: number;

  notes: Note[],
  // confirmations: number;
  // address: string | null;
  // addressIndex: number;
}

// ── Queries ───────────────────────────────────────────────────────────────────

// type Note {
//   id: Int!
//   height: Int!
//   pool: Int!
//   value: BigDecimal!
//   address: String!
//   scope: Int!
//   diversifier: String!
//   memo: String
//   tx: Transaction!
// }

// type Transaction {
//   id: Int!
//   txid: String!
//   account: Account!
//   height: Int!
//   time: LocalDateTime!
//   value: BigDecimal!
//   fee: BigDecimal!
//   notes: [Note!]!
//   outputs: [Output!]!
//   spends: [Note!]!
// }

        // amount
        // fee
        // height
        // confirmations
        // address
        // addressIndex

export async function gqlTransactionById(
  client: Client,
  idAccount: number,
  txid: string
): Promise<GqlTransaction> {
  const data = await gql<{ transactionById: GqlTransaction }>(
    client,
    `query TransactionById($idAccount: Int!, $txid: String!) {
      transactionById(idAccount: $idAccount, txid: $txid) {
        txid
        value
        fee
        height
        notes {
          address
          diversifier
        }
      }
    }`,
    { idAccount, txid }
  );
  return data.transactionById;
}

export async function gqlTransactionsByAccount(
  client: Client,
  idAccount: number,
  height?: number
): Promise<GqlTransaction[]> {
  const data = await gql<{ transactionsByAccount: GqlTransaction[] }>(
    client,
    `query TransactionsByAccount($idAccount: Int!, $height: Int) {
      transactionsByAccount(idAccount: $idAccount, height: $height) {
        id
        txid
        account
        height
        time
        value
        fee
        notes {
          address
          value
          memo
          pool
          scope
          diversifier
          diversifierIndex
        }
        outputs {
          address
          value
          memo
        }
        spends {
          address
          value
          memo
        }
      }
    }`,
    { idAccount, height }
  );
  return data.transactionsByAccount;
}

// export async function gqlTransactionsByAccount(
//   client: Client,
//   idAccount: number,
//   height?: number
// ): Promise<GqlTransaction[]> {
//   const data = await gql<{ transactionsByAccount: GqlTransaction[] }>(
//     client,
//     `query TransactionsByAccount($idAccount: Int!, $height: Int) {
//       transactionsByAccount(idAccount: $idAccount, height: $height) {
//         txid
//         amount
//         fee
//         height
//         confirmations
//         address
//         addressIndex
//       }
//     }`,
//     { idAccount, height }
//   );
//   return data.transactionsByAccount;
// }

export async function gqlLatestHeight(client: Client): Promise<number> {
  const data = await gql<{ currentHeight: number }>(
    client,
    `query {
      currentHeight
    }`,
    {}
  );
  return data.currentHeight;
}
