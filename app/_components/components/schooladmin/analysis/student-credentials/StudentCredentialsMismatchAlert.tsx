"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

type Props = {
  mismatchCount: number;
  pendingCount: number;
};

export default function StudentCredentialsMismatchAlert({ mismatchCount, pendingCount }: Props) {
  if (pendingCount > 0) {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-100 sm:text-sm">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <p>
          Checking passwords for <strong>{pendingCount}</strong> more student{pendingCount === 1 ? "" : "s"}. This is
          slow only the first time; the list fills in by itself.
        </p>
      </div>
    );
  }
  if (mismatchCount <= 0) return null;

  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100 sm:text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <strong>{mismatchCount}</strong> student{mismatchCount === 1 ? "" : "s"}{" "}
        cannot show a password (changed, missing, or no date of birth). Use{" "}
        <strong>Reset to DOB password</strong>, then share the updated list.
      </p>
    </div>
  );
}
