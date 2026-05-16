"use client";

import { ArrowLeft } from "lucide-react";
import AuthPortal from "../AuthPortal";

interface SignInScreenProps {
  onBack: () => void;
  context: "demo" | "direct";
}

export default function SignInScreen({ onBack, context }: SignInScreenProps) {
  return (
    <div className="relative min-h-screen bg-[#020308] text-[#f3f6fb]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#000000_0%,#05070c_42%,#0b0e14_100%)] z-0" />
      <div className="film-grain absolute inset-0 opacity-30 mix-blend-soft-light z-0" />
      
      {/* Top Bar */}
      <div className="relative z-20 flex items-center justify-between p-6 max-w-7xl mx-auto w-full">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back
        </button>
      </div>

      <div className="relative z-10 -mt-16 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="text-center mb-6 z-20 relative">
          <p className="text-2xl font-semibold tracking-tight text-white mb-2">Welcome back 👋</p>
          <p className="text-sm text-[#a1a1aa]">
            {context === "demo" 
              ? "Let's save your progress and continue." 
              : "Sign in to your workspace."}
          </p>
        </div>
        
        {/* We reuse the existing AuthPortal but we have to override its styling or wrap it carefully.
            Since AuthPortal has its own full-screen layout, we'll render it inside a container 
            and let it handle its own internal state. To prevent its own full screen styling from taking over,
            we could modify AuthPortal, but for now we just render it. 
            Note: AuthPortal has `min-h-screen` which might push it down. 
            We'll adjust the wrapper to make it fit nicely. */}
        <div className="w-full relative z-20 -mt-20">
          <AuthPortal />
        </div>
      </div>
    </div>
  );
}
