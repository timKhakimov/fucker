"use server";

import { coreDB } from "./db";

interface Account {
  accountId: string;
  username?: string;
  dcId?: string;
  prefix: string;
  parentAccountId?: string;
  prevApiId?: string;
  nextApiId?: string;
  phone?: string;
  [key: string]: any;
}

interface ExportAccount {
  accountId: string;
  authKey: string;
  dcId: number;
  error?: string;
  spamBlockDate?: Date;
}

const getAccountsCollection = async () => {
  return (await coreDB()).collection<Account>("accounts");
};

export async function checkExistingAccounts(
  authKeys: string[]
): Promise<string[]> {
  const accountsCollection = await getAccountsCollection();

  const existingAccounts = await accountsCollection
    .find({ accountId: { $in: authKeys } })
    .project({ accountId: 1 })
    .toArray();

  return existingAccounts.map((account) => account.accountId);
}

export async function getAccountsByPrefix(prefix: string): Promise<Account[]> {
  const accountsCollection = await getAccountsCollection();
  const accounts = await accountsCollection
    .find(
      { prefix },
      {
        projection: {
          accountId: 1,
          username: 1,
          dcId: 1,
          prefix: 1,
          parentAccountId: 1,
          prevApiId: 1,
          nextApiId: 1,
          phone: 1,
          workedOut: 1,
          error: 1,
          reason: 1,
          banned: 1,
          stable: 1,
          spamBlockDate: 1,
        },
      }
    )
    .toArray();

  return JSON.parse(JSON.stringify(accounts));
}

export async function createAccounts(accounts: string[], prefix: string) {
  const accountsCollection = await getAccountsCollection();

  // Удаляем дубликаты из входящего массива
  const uniqueAccounts = Array.from(new Set(accounts));

  const accountsToInsert = uniqueAccounts.map((account) => {
    const [authKey, dcId] = account.split(":");
    const username = authKey.slice(0, 32);
    const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 8);

    const data: any = {
      accountId: `${username}_${uuid}`,
      dcId: Number(dcId),
      prefix,
    };
    data[`dc${dcId}`] = authKey;

    return data;
  });

  // Удаляем дубликаты по accountId (хотя теперь они должны быть уникальными благодаря UUID)
  const uniqueAccountsToInsert = Array.from(
    new Map(accountsToInsert.map((item) => [item.accountId, item])).values()
  );

  if (uniqueAccountsToInsert.length > 0) {
    await accountsCollection.insertMany(uniqueAccountsToInsert, { ordered: false });
  }

  return uniqueAccountsToInsert;
}

export async function getAccountById(accountId: string) {
  const accountsCollection = await getAccountsCollection();

  const account = await accountsCollection.findOne(
    {
      accountId,
    },
    {
      projection: {
        accountId: 1,
        username: 1,
        dcId: 1,
        prefix: 1,
        parentAccountId: 1,
        prevApiId: 1,
        nextApiId: 1,
      },
    }
  );

  return account ? JSON.parse(JSON.stringify(account)) : null;
}

export async function getAllAccountsByPrefixes(
  prefixes: string[]
): Promise<Account[]> {
  const accountsCollection = await getAccountsCollection();
  const accounts = await accountsCollection
    .find(
      { prefix: { $in: prefixes } },
      {
        projection: {
          _id: 0,
          accountId: 1,
          prefix: 1,
          parentAccountId: 1,
          workedOut: 1,
          error: 1,
          reason: 1,
          banned: 1,
          stable: 1,
        },
      }
    )
    .toArray();

  return JSON.parse(JSON.stringify(accounts));
}

export async function getErrorAccountsByPrefix(
  prefix: string
): Promise<ExportAccount[]> {
  const accountsCollection = await getAccountsCollection();
  const accounts = await accountsCollection
    .find(
      {
        prefix,
        $or: [
          { banned: true },
          { reason: { $ne: null } },
          { error: { $ne: null } },
        ],
      },
      {
        projection: {
          _id: 0,
          accountId: 1,
          dcId: 1,
          dc1: 1,
          dc2: 1,
          dc3: 1,
          dc4: 1,
          dc5: 1,
          parentAccountId: 1,
          error: 1,
          reason: 1,
        },
      }
    )
    .toArray();

  // Группируем аккаунты по parentAccountId
  const accountsMap = new Map<string, any>();

  accounts.forEach((account) => {
    if (account.parentAccountId) {
      // Это дочерний аккаунт
      const parent = accountsMap.get(account.parentAccountId);
      if (parent) {
        parent.shouldInclude = true;
        if (account.reason || account.error) {
          parent.error = account.reason || account.error;
        }
      }
    } else {
      // Это родительский аккаунт
      if (!accountsMap.has(account.accountId)) {
        const dcField = account.dcId ? `dc${account.dcId}` : null;
        accountsMap.set(account.accountId, {
          accountId: account.accountId,
          authKey: dcField ? account[dcField] : null,
          dcId: Number(account.dcId),
          error: account.reason || account.error,
          shouldInclude: true,
        });
      }
    }
  });

  const result = Array.from(accountsMap.values())
    .filter((account) => account.shouldInclude)
    .map(({ accountId, authKey, dcId, error }) => ({
      accountId,
      authKey,
      dcId,
      ...(error ? { error } : {}),
    }));

  return result;
}

export async function stopStableAccounts(prefix: string): Promise<number> {
  const accountsCollection = await getAccountsCollection();
  const result = await accountsCollection.updateMany(
    {
      prefix,
      stable: true,
      banned: { $ne: true },
      stopped: { $ne: true },
      parentAccountId: { $exists: true },
      forceStop: { $ne: true },
    },
    {
      $set: {
        forceStop: true,
      },
    }
  );

  return result.modifiedCount;
}

export async function getStoppedAccountsByPrefix(
  prefix: string
): Promise<ExportAccount[]> {
  const accountsCollection = await getAccountsCollection();
  const accounts = await accountsCollection
    .find(
      {
        prefix,
        forceStop: true,
        banned: true,
        reason: 'manual-stopped'
      },
      {
        projection: {
          _id: 0,
          accountId: 1,
          dcId: 1,
          dc1: 1,
          dc2: 1,
          dc3: 1,
          dc4: 1,
          dc5: 1,
          spamBlockDate: 1
        },
      }
    )
    .toArray();

  return accounts.map(account => {
    const dcField = account.dcId ? `dc${account.dcId}` : null;
    return {
      accountId: account.accountId,
      authKey: dcField ? account[dcField] : null,
      dcId: Number(account.dcId),
      spamBlockDate: account.spamBlockDate
    };
  });
}

export async function hasStableAccountsToStop(
  prefix: string
): Promise<boolean> {
  const accountsCollection = await getAccountsCollection();
  const count = await accountsCollection.countDocuments({
    prefix,
    stable: true,
    banned: { $ne: true },
    stopped: { $ne: true },
    parentAccountId: { $exists: true },
    forceStop: { $ne: true },
  });

  return count > 0;
}

export async function hasStoppedAccounts(prefix: string): Promise<boolean> {
  const accountsCollection = await getAccountsCollection();
  const count = await accountsCollection.countDocuments({
    prefix,
    forceStop: true,
    banned: true,
    reason: 'manual-stopped'
  });

  return count > 0;
}
