"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";

import DocumindLanding from "@/components/DocumindLanding";

const FLASK_API_URL = "http://localhost:5000";

interface MeResponse {
  email: string;
  auth_provider: string;
}

export default function WorkspaceShell() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch(`${FLASK_API_URL}/api/auth/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          startTransition(() => router.replace("/"));
          return;
        }

        const data = await response.json();
        setUser({ email: data.email, auth_provider: data.auth_provider });
      } catch (requestError) {
        console.error("Workspace auth check failed:", requestError);
        startTransition(() => router.replace("/"));
        return;
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, [router]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await fetch(`${FLASK_API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (requestError) {
      console.error("Logout failed:", requestError);
    } finally {
      startTransition(() => router.replace("/"));
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020308] text-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
          <p className="text-sm uppercase tracking-[0.28em] text-white/60">Opening workspace</p>
        </div>
      </main>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-0 top-0 z-30 flex w-full justify-between px-6 py-6">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2.5 text-sm text-white/82 shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          <ShieldCheck className="h-4 w-4 text-sky-200" />
          <span className="font-medium">{user?.email}</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2.5 text-sm font-medium text-white/82 shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl transition hover:bg-white/[0.12] disabled:cursor-wait disabled:opacity-70"
        >
          <LogOut className="h-4 w-4" />
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>

      <DocumindLanding />
    </div>
  );
}
