"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const STAGES = [
  "Extracting text and structure...",
  "Detecting tables and charts...",
  "Building semantic index..."
];

export default function LoadingScreen() {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 2000); // Change stage every 2 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#020308] text-[#f3f6fb] selection:bg-[rgba(172,220,255,0.22)]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#000000_0%,#05070c_42%,#0b0e14_100%)] z-0" />
      <div className="film-grain absolute inset-0 opacity-30 mix-blend-soft-light z-0" />
      
      <div className="relative z-10 flex flex-col items-center">
        {/* Animated loader core */}
        <div className="relative w-24 h-24 mb-8">
          <motion.div
            className="absolute inset-0 rounded-full border-t-2 border-l-2 border-[#417cc9] opacity-70"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border-r-2 border-b-2 border-[#84d6ff] opacity-40"
            animate={{ rotate: -360 }}
            transition={{ duration: 2, ease: "linear", repeat: Infinity }}
          />
          <div className="absolute inset-4 rounded-full bg-[radial-gradient(circle,rgba(65,124,201,0.4)_0%,transparent_70%)] animate-pulse" />
        </div>

        <motion.p
          className="text-lg font-medium text-white/90 tracking-wide"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Analyzing document…
        </motion.p>
        
        <div className="h-6 mt-3 overflow-hidden flex items-center justify-center">
            <motion.p
              key={stageIndex}
              className="text-sm text-white/50 tracking-wider uppercase text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {STAGES[stageIndex]}
            </motion.p>
        </div>
      </div>
    </div>
  );
}
