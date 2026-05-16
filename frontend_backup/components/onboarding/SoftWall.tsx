"use client";

import { motion } from "framer-motion";

interface SoftWallProps {
  onSignIn: () => void;
}

export default function SoftWall({ onSignIn }: SoftWallProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full rounded-xl border border-[#1e61cc]/30 bg-[#1e61cc]/5 p-6 backdrop-blur-md shadow-inner text-center my-4"
    >
      <div className="max-w-md mx-auto">
        <h3 className="text-base font-semibold text-white mb-2">You've explored 3 answers — nice!</h3>
        <p className="text-sm text-white/70 mb-6 leading-relaxed">
          Sign in to unlock unlimited questions and save your insights securely in your workspace.
        </p>
        
        <button
          onClick={onSignIn}
          className="px-8 py-3 rounded-full bg-white text-[#0a0f18] text-sm font-semibold hover:bg-gray-100 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] relative overflow-hidden group"
        >
          <span className="relative z-10">Sign In to Continue</span>
          <div className="absolute inset-0 bg-white/20 animate-pulse group-hover:animate-none" />
        </button>
      </div>
    </motion.div>
  );
}
