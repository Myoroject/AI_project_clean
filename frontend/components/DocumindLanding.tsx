"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText } from "lucide-react";

const FLASK_API_URL = "http://localhost:5000";
const NEXTJS_ANALYSIS_URL = "/analysis";

const FORMAT_NODES = [
  { label: "PDF", x: -170, y: -124, delay: 0.04 },
  { label: "DOCX", x: 184, y: -96, delay: 0.08 },
  { label: "CSV", x: -208, y: 38, delay: 0.12 },
  { label: "TXT", x: 0, y: 182, delay: 0.16 },
  { label: "IMG", x: 210, y: 48, delay: 0.2 },
];

const PARTICLES = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  left: ((index * 17 + 11) % 100),
  top: ((index * 23 + 19) % 100),
  size: 1 + (index % 3),
  depth: 0.35 + ((index % 7) * 0.16),
  opacity: 0.16 + ((index % 5) * 0.08),
}));

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function DocumindLanding() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [orbCenter, setOrbCenter] = useState({ x: 0, y: 0 });
  const [dragLabel, setDragLabel] = useState("Document");

  useEffect(() => {
    const updateMetrics = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });

      if (orbRef.current) {
        const rect = orbRef.current.getBoundingClientRect();
        setOrbCenter({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    };

    updateMetrics();
    window.addEventListener("resize", updateMetrics);

    return () => window.removeEventListener("resize", updateMetrics);
  }, []);

  useEffect(() => {
    if (!uploadError) {
      return;
    }

    const timer = setTimeout(() => setUploadError(null), 10000);
    return () => clearTimeout(timer);
  }, [uploadError]);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${FLASK_API_URL}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data = await response.json();

      if (response.ok && data.ok && data.doc_id) {
        window.location.href = `${NEXTJS_ANALYSIS_URL}?doc_id=${data.doc_id}`;
        return;
      }

      const errorMessage = data.error || data.detail || "Upload failed";
      setUploadError(errorMessage);
      setIsUploading(false);
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        setUploadError("Cannot connect to backend. Make sure Flask is running on port 5000.");
      } else {
        setUploadError("Upload failed. Check the browser console for details.");
      }
      setIsUploading(false);
    }
  };

  const showToastMessage = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];

    if (!files.length) {
      return;
    }

    handleFileUpload(files[0]);

    if (files.length > 1) {
      showToastMessage();
    }

    event.target.value = "";
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
    setDragPoint({ x: event.clientX, y: event.clientY });

    const hoveredFile = event.dataTransfer.files?.[0];
    if (hoveredFile?.name) {
      setDragLabel(hoveredFile.name);
    } else {
      setDragLabel("Document");
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (
      event.clientX <= 0 ||
      event.clientY <= 0 ||
      event.clientX >= viewport.width ||
      event.clientY >= viewport.height
    ) {
      setIsDragging(false);
      setDragPoint(null);
      setDragLabel("Document");
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    setIsDragging(false);
    setDragPoint(null);

    const files = Array.from(event.dataTransfer.files);
    if (!files.length) {
      return;
    }

    handleFileUpload(files[0]);
    if (files.length > 1) {
      showToastMessage();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    setPointer({ x: event.clientX, y: event.clientY });
  };

  const activePoint = isDragging ? dragPoint : pointer;
  const activeDistance = activePoint
    ? Math.hypot(activePoint.x - orbCenter.x, activePoint.y - orbCenter.y)
    : 9999;
  const proximity = clamp(
    1 - activeDistance / (viewport.width < 640 ? 240 : 420),
    0,
    1,
  );
  const iconReveal = clamp(
    1 - (pointer ? Math.hypot(pointer.x - orbCenter.x, pointer.y - orbCenter.y) : 9999) / 290,
    0,
    1,
  );
  const showFormatNodes = iconReveal > 0.18 || isDragging || isUploading;
  const cursorOffsetX = pointer && viewport.width ? pointer.x - viewport.width / 2 : 0;
  const cursorOffsetY = pointer && viewport.height ? pointer.y - viewport.height / 2 : 0;
  const dragGhost = dragPoint
    ? {
        x: dragPoint.x + (orbCenter.x - dragPoint.x) * proximity * 0.42 - 76,
        y: dragPoint.y + (orbCenter.y - dragPoint.y) * proximity * 0.42 - 26,
      }
    : null;

  const statusKicker = isUploading ? "THINKING" : isDragging ? "GRAVITY" : "THE CORE";
  const statusLabel = isUploading ? "Breathing" : isDragging ? "Release" : "Feed";
  const statusMessage = isUploading
    ? "The Oracle is listening for structure, context, and meaning."
    : isDragging
      ? "Bring the document closer. The field is already pulling it inward."
      : "Drag a document into the field or tap the Core to feed the Oracle.";

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#020308] text-[#f5f7fb]"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPointer(null)}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.csv,.xlsx,.docx,.txt,.md,.png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileInputChange}
        disabled={isUploading}
      />

      <div className="absolute inset-0 bg-[linear-gradient(180deg,#000000_0%,#05070c_35%,#0b0e14_100%)]" />
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 opacity-90"
        animate={{
          background: viewport.width
            ? [
                `radial-gradient(circle 560px at ${orbCenter.x}px ${orbCenter.y}px, rgba(132, 214, 255, 0.18), transparent 58%), radial-gradient(circle 420px at ${viewport.width * 0.16}px ${viewport.height * 0.24}px, rgba(22, 56, 122, 0.24), transparent 64%), radial-gradient(circle 460px at ${viewport.width * 0.82}px ${viewport.height * 0.18}px, rgba(40, 78, 126, 0.16), transparent 62%)`,
                `radial-gradient(circle 590px at ${orbCenter.x}px ${orbCenter.y}px, rgba(132, 214, 255, 0.22), transparent 58%), radial-gradient(circle 420px at ${viewport.width * 0.14}px ${viewport.height * 0.28}px, rgba(22, 56, 122, 0.28), transparent 64%), radial-gradient(circle 460px at ${viewport.width * 0.86}px ${viewport.height * 0.16}px, rgba(40, 78, 126, 0.18), transparent 62%)`,
              ]
            : undefined,
        }}
        transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, repeatType: "mirror" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 opacity-80"
        animate={{
          background: viewport.width
            ? `radial-gradient(circle 320px at ${isDragging && dragPoint ? dragPoint.x : orbCenter.x}px ${isDragging && dragPoint ? dragPoint.y : orbCenter.y}px, rgba(171, 230, 255, ${0.1 + proximity * 0.18}), transparent 72%)`
            : undefined,
        }}
        transition={{ type: "spring", stiffness: 80, damping: 22 }}
      />
      <div className="film-grain absolute inset-0 opacity-30 mix-blend-soft-light" />

      {PARTICLES.map((particle) => {
        const driftX = (cursorOffsetX / Math.max(viewport.width, 1)) * 28 * particle.depth;
        const driftY = (cursorOffsetY / Math.max(viewport.height, 1)) * 28 * particle.depth;

        return (
          <motion.span
            key={particle.id}
            aria-hidden="true"
            className="absolute rounded-full bg-white"
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              x: driftX,
              y: driftY,
              boxShadow: "0 0 12px rgba(183, 224, 255, 0.5)",
            }}
            animate={{
              opacity: [particle.opacity * 0.65, particle.opacity, particle.opacity * 0.65],
              scale: [1, 1.4, 1],
            }}
            transition={{
              duration: 3.2 + particle.depth,
              repeat: Number.POSITIVE_INFINITY,
              delay: particle.id * 0.08,
            }}
          />
        );
      })}

      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            className="fixed left-1/2 top-5 z-50 w-[min(92vw,34rem)] -translate-x-1/2 rounded-[1.4rem] border border-white/10 bg-[rgba(63,16,20,0.85)] px-6 py-4 text-center shadow-[0_25px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
          >
            <p className="text-[0.7rem] uppercase tracking-[0.35em] text-rose-200/70">Upload Error</p>
            <p className="mt-2 text-sm text-rose-50/95">{uploadError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isDragging && dragGhost && (
          <motion.div
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.84 }}
            className="pointer-events-none fixed left-0 top-0 z-40"
            style={{ x: dragGhost.x, y: dragGhost.y }}
          >
            <div className="flex items-center gap-3 rounded-full border border-white/14 bg-white/[0.09] px-4 py-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.11] text-sky-100">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="max-w-[12rem] truncate text-sm font-medium text-white/92">{dragLabel}</p>
                <p className="text-[0.65rem] uppercase tracking-[0.3em] text-white/45">Falling Inward</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="text-[0.62rem] uppercase tracking-[0.55em] text-white/32">DocMind Oracle</p>
          <h1 className="mx-auto mt-6 max-w-5xl text-balance text-[clamp(2.9rem,7vw,5.9rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">
            Your data. Your insights. Absolute privacy.
          </h1>
        </motion.div>

        <div className="relative mt-12 flex h-[29rem] w-full items-center justify-center sm:mt-16">
          <AnimatePresence>
            {showFormatNodes &&
              FORMAT_NODES.map((node) => (
                <motion.div
                  key={node.label}
                  initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                  animate={{
                    opacity: 0.88,
                    scale: 1,
                    x: node.x * (viewport.width < 640 ? 0.62 : 1),
                    y: node.y * (viewport.width < 640 ? 0.62 : 1),
                  }}
                  exit={{ opacity: 0, scale: 0.45, x: 0, y: 0 }}
                  transition={{
                    duration: 0.68,
                    delay: node.delay,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="pointer-events-none absolute left-1/2 top-1/2"
                >
                  <div className="rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-[0.7rem] font-medium uppercase tracking-[0.34em] text-white/75 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                    {node.label}
                  </div>
                </motion.div>
              ))}
          </AnimatePresence>

          <motion.div
            aria-hidden="true"
            className="absolute h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(112,198,255,0.28)_0%,rgba(65,124,201,0.12)_44%,transparent_72%)] blur-3xl sm:h-[24rem] sm:w-[24rem]"
            animate={{
              scale: isUploading ? [1, 1.08, 1] : isDragging ? 1 + proximity * 0.16 : 1,
              opacity: isUploading ? [0.55, 0.82, 0.55] : 0.62 + proximity * 0.2,
            }}
            transition={{
              duration: isUploading ? 2.2 : 0.32,
              repeat: isUploading ? Number.POSITIVE_INFINITY : 0,
            }}
          />

          <motion.button
            ref={orbRef}
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            animate={{
              scale: isUploading ? [1, 1.03, 1] : 1 + proximity * 0.12,
              y: isDragging ? -proximity * 6 : 0,
            }}
            transition={{
              duration: isUploading ? 2.2 : 0.26,
              repeat: isUploading ? Number.POSITIVE_INFINITY : 0,
              ease: "easeInOut",
            }}
            className="group relative flex h-[17rem] w-[17rem] items-center justify-center rounded-full border border-white/8 bg-white/[0.05] shadow-[0_36px_140px_rgba(0,0,0,0.42)] backdrop-blur-[30px] transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-wait sm:h-[21rem] sm:w-[21rem]"
          >
            <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(circle_at_30%_26%,rgba(255,255,255,0.28),transparent_32%),radial-gradient(circle_at_55%_70%,rgba(135,209,255,0.2),transparent_50%),rgba(255,255,255,0.04)]" />
            <div className="absolute inset-[10%] rounded-full border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.02))]" />
            <motion.div
              aria-hidden="true"
              className="absolute inset-[19%] rounded-full bg-[radial-gradient(circle,rgba(214,244,255,0.65)_0%,rgba(124,199,255,0.2)_36%,transparent_72%)] blur-xl"
              animate={{
                scale: isUploading ? [0.92, 1.08, 0.92] : isDragging ? 0.94 + proximity * 0.16 : 0.98,
                opacity: isUploading ? [0.45, 0.9, 0.45] : 0.42 + proximity * 0.24,
              }}
              transition={{
                duration: isUploading ? 2.15 : 0.28,
                repeat: isUploading ? Number.POSITIVE_INFINITY : 0,
              }}
            />
            <motion.div
              aria-hidden="true"
              className="absolute inset-[28%] rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.92),rgba(171,225,255,0.34)_44%,rgba(101,155,220,0.14)_74%,transparent_100%)]"
              animate={{
                opacity: isUploading ? [0.78, 1, 0.78] : 0.9,
                scale: isUploading ? [0.98, 1.04, 0.98] : 1,
              }}
              transition={{
                duration: 2.2,
                repeat: isUploading ? Number.POSITIVE_INFINITY : 0,
                ease: "easeInOut",
              }}
            />

            <div className="relative z-10 flex flex-col items-center text-center">
              <p className="text-[0.62rem] uppercase tracking-[0.5em] text-white/40">{statusKicker}</p>
              <p className="mt-4 text-[1.45rem] font-medium tracking-[0.22em] text-white/88 sm:text-[1.7rem]">
                {statusLabel}
              </p>
            </div>
          </motion.button>
        </div>

        <motion.p
          className="max-w-xl text-center text-[0.8rem] uppercase tracking-[0.34em] text-white/42 sm:text-[0.84rem]"
          animate={{ opacity: isUploading ? [0.45, 0.8, 0.45] : 0.56 }}
          transition={{ duration: 2.15, repeat: isUploading ? Number.POSITIVE_INFINITY : 0 }}
        >
          {statusMessage}
        </motion.p>

        <div className="mt-10 flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.045] px-5 py-3 text-[0.64rem] uppercase tracking-[0.38em] text-white/46 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <span className="h-2 w-2 rounded-full bg-[#d9b36a] shadow-[0_0_14px_rgba(217,179,106,0.85)]" />
          Oracle-grade privacy
        </div>

        <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 text-[0.58rem] uppercase tracking-[0.42em] text-[#d3b47b]/85">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d3b47b]/30 bg-[linear-gradient(145deg,rgba(233,209,155,0.22),rgba(160,118,46,0.08))] shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 5.5h9.5a2 2 0 0 1 2 2V18" />
              <path d="M6 5.5a2.5 2.5 0 0 0-2.5 2.5v8A2.5 2.5 0 0 1 6 18.5h12" />
              <path d="M8 9h7" />
              <path d="M8 12h6" />
            </svg>
          </div>
          <span>Physical Ledger</span>
        </div>
      </main>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="fixed bottom-8 left-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 rounded-[1.4rem] border border-white/10 bg-white/[0.08] px-5 py-4 shadow-[0_18px_70px_rgba(0,0,0,0.34)] backdrop-blur-2xl"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-white/70">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.3em] text-white/46">Single Ingestion</p>
                <p className="mt-1 text-sm text-white/84">One document at a time for now. Multi-file constellations come next.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
