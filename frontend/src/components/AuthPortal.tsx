"use client";

import { Building2 } from "lucide-react";

import AuthFormCard from "@/components/auth/AuthFormCard";

export default function AuthPortal() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12 text-white">
      <div className="mb-6 flex flex-col items-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05] shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <Building2 className="h-5 w-5 text-white/88" />
        </div>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.42em] text-white/40">
          DocuMind
        </p>
      </div>

      <AuthFormCard />
    </main>
  );
}
