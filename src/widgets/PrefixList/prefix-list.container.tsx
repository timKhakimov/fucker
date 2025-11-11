"use client";

import { useQuery, useQueryClient } from "react-query";
import { getAllPrefixes, createPrefix } from "@/src/db/prefix";
import { PrefixList } from "./prefix-list";
import type { Prefix } from "@/src/@types/Prefix";
import { useState } from "react";
import { message } from "antd";
import { PrefixListCreateModal } from "./__create-modal/prefix-list__create-modal";

interface CreatePrefixFormData {
  prefix: string;
  description: string;
  accounts: string;
}

interface ValidatedAccount {
  authKey: string;
  dcId: string;
}

interface ValidationResult {
  isValid: boolean;
  message: string;
  type: "error" | "warning";
  accounts?: ValidatedAccount[];
}

const ACCOUNTS_LIMIT = 50000;
const ACCOUNT_FORMAT = /^[a-zA-Z0-9]+:[0-9]+$/;

export const PrefixListContainer = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: prefixes = [], isLoading } = useQuery<Prefix[]>(
    ["prefixes"],
    () => getAllPrefixes(),
    {
      staleTime: Infinity,
    }
  );

  const generatePrefix = () => {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `pf_${timestamp}_${random}`;
  };

  const validateAccounts = async (
    accounts: string
  ): Promise<ValidationResult> => {
    const accountsList = accounts.trim().split("\n").filter(Boolean);

    if (accountsList.length > ACCOUNTS_LIMIT) {
      return {
        isValid: false,
        message: "Превышен лимит в 20000 аккаунтов",
        type: "error",
      };
    }

    const invalidAccounts = accountsList.filter(
      (account) => !ACCOUNT_FORMAT.test(account.trim())
    );

    if (invalidAccounts.length > 0) {
      return {
        isValid: false,
        message:
          "Некорректный формат аккаунтов. Каждый аккаунт должен быть в формате authKey:dcId.",
        type: "error",
      };
    }

    const parsedAccounts = accountsList.map((account) => {
      const [authKey, dcId] = account.split(":");
      return { authKey, dcId };
    });

    return {
      isValid: true,
      message: `Будет добавлено ${accountsList.length} аккаунтов под новым префиксом`,
      type: "warning",
      accounts: parsedAccounts,
    };
  };

  const handleCreate = async (data: CreatePrefixFormData) => {
    try {
      const validation = await validateAccounts(data.accounts);

      if (!validation.isValid) {
        message.error(validation.message);
        return;
      }

      const accountsList = validation.accounts!.map(
        (acc) => `${acc.authKey}:${acc.dcId}`
      );
      await createPrefix(data.prefix, data.description, accountsList);

      message.success(
        `Добавлено ${validation.accounts!.length} аккаунтов под префиксом ${data.prefix}`
      );

      queryClient.invalidateQueries(["prefixes"]);
      setIsModalOpen(false);
    } catch (error: any) {
      message.error(`Ошибка при создании префикса: ${error.message}`);
    }
  };

  return (
    <>
      <PrefixList
        prefixes={prefixes}
        isLoading={isLoading}
        onAddClick={() => setIsModalOpen(true)}
      />
      <PrefixListCreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreate}
        initialPrefix={generatePrefix()}
        validateAccounts={validateAccounts}
      />
    </>
  );
};
