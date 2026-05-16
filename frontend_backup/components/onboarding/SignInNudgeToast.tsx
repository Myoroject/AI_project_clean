"use client";

import { motion, AnimatePresence } from "framer-motion";

interface SignInNudgeToastProps {
  onContinue: () => void;
  onDismiss: () => void;
  isVisible: boolean;
}

export default function SignInNudgeToast({ onContinue, onDismiss, isVisible }: SignInNudgeToastProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-6 right-6 z-50 w-full max-w-[340px] rounded-xl border border-white/10 bg-[#0f141f]/90 p-5 shadow-[0_20px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💾</span>
            <h3 className="text-sm font-semibold text-white tracking-wide">Save your insights</h3>
          </div>
          
          <div className="text-[0.85rem] text-white/70 space-y-2 mb-5">
            <p>Create your workspace to:</p>
            <ul className="space-y-1.5 ml-1">
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-[#1e61cc] mt-1.5 shrink-0" />
                <span>Upload unlimited documents</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-[#1e61cc] mt-1.5 shrink-0" />
                <span>Ask deeper questions</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-[#1e61cc] mt-1.5 shrink-0" />
                <span>Track and organize your insights</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-[#1e61cc] mt-1.5 shrink-0" />
                <span>Access your history anytime</span>
              </li>
            </ul>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onContinue}
              className="flex-1 py-2.5 rounded-lg bg-[#1e61cc] hover:bg-[#2571eb] text-white text-xs font-medium transition-colors"
            >
              Continue & Sign In
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
