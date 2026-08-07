"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  DEFAULT_SYSTEM_CONFIGURATION,
  type SystemConfiguration,
} from "@/lib/system-configuration";
import {
  withConfiguredPrefix,
  type DocumentNumberKind,
} from "@/lib/document-numbering-shared";

const SystemConfigContext = createContext<SystemConfiguration>(DEFAULT_SYSTEM_CONFIGURATION);

export function SystemConfigProvider({
  config,
  children,
}: {
  config: SystemConfiguration;
  children: ReactNode;
}) {
  const value = useMemo(() => config, [config]);
  return <SystemConfigContext.Provider value={value}>{children}</SystemConfigContext.Provider>;
}

export function useSystemConfig() {
  return useContext(SystemConfigContext);
}

export function useDocumentNumber(kind: DocumentNumberKind, stored: string | null | undefined) {
  const config = useSystemConfig();
  const prefixKey =
    kind === "invoice"
      ? "invoicePrefix"
      : kind === "contract"
        ? "contractPrefix"
        : kind === "ticket"
          ? "ticketPrefix"
          : "paymentPrefix";
  return withConfiguredPrefix(stored, config.numbering[prefixKey], kind);
}

export function DocumentNumber({
  kind,
  value,
  className,
}: {
  kind: DocumentNumberKind;
  value: string | null | undefined;
  className?: string;
}) {
  const display = useDocumentNumber(kind, value);
  return <span className={className}>{display || "—"}</span>;
}
