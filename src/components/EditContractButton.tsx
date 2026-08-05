"use client";

import { useRouter } from "next/navigation";

type Props = {
  href: string;
  isActive: boolean;
};

export function EditContractButton({ href, isActive }: Props) {
  const router = useRouter();

  function onClick() {
    if (isActive) {
      const confirmed = window.confirm(
        "This contract is ACTIVE.\n\nEditing can affect live billing, SLA terms, and support coverage. Price changes will require manager approval before they apply.\n\nContinue to edit?"
      );
      if (!confirmed) return;
    }
    router.push(href);
  }

  return (
    <button type="button" className="btn btn-primary btn-sm" onClick={onClick}>
      Edit contract
    </button>
  );
}
