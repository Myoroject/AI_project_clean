"use client";

import {
  ChangeEvent,
  DragEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Pin,
  Plus,
  Settings,
  Share2,
  Sparkles,
  Upload,
} from "lucide-react";

/* ───────────────────────────── constants ───────────────────────────── */
const FLASK_API_URL = "http://localhost:5000";
const NEXTJS_ANALYSIS_URL = "/analysis";

/* ───────────────────────────── types ───────────────────────────── */
interface MeResponse {
  email: string;
  auth_provider: string;
}

type QueueStatus = "idle" | "uploading" | "processing" | "completed" | "error";

interface QueueItem {
  id: string;
  name: string;
  sizeLabel: string;
  isPdf: boolean;
  uploadProgress: number;
  textProgress: number;
  renderProgress: number;
  status: QueueStatus;
  detail: string;
}

/* ───────────────────────────── helpers ───────────────────────────── */
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

/* small horizontal progress bar used inside queue items */
function MiniProgress({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-[5px] w-24 overflow-hidden rounded-full bg-slate-200 ${className}`}>
      <div
        className="h-full rounded-full bg-[#0f4c81] transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*                         MAIN COMPONENT                             */
/* ═══════════════════════════════════════════════════════════════════ */
export default function DashboardShell() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingIntervalRef = useRef<number | null>(null);

  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [queueItem, setQueueItem] = useState<QueueItem | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /* ── auth check ── */
  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch(`${FLASK_API_URL}/api/auth/me`, { credentials: "include" });
        if (!res.ok) { startTransition(() => router.replace("/")); return; }
        const data = await res.json();
        setUser({ email: data.email, auth_provider: data.auth_provider });
      } catch {
        startTransition(() => router.replace("/"));
      } finally {
        setLoading(false);
      }
    };
    loadUser();
    return () => { if (processingIntervalRef.current) window.clearInterval(processingIntervalRef.current); };
  }, [router]);

  /* ── queue status label ── */
  const queueStatusLabel = useMemo(() => {
    if (!queueItem) return "Awaiting upload";
    switch (queueItem.status) {
      case "uploading": return "Uploading";
      case "processing": return "Processing";
      case "completed": return "Ready";
      case "error": return "Attention needed";
      default: return "Awaiting upload";
    }
  }, [queueItem]);

  /* ── queue helpers (unchanged logic) ── */
  const clearProcessingTimer = () => {
    if (processingIntervalRef.current) { window.clearInterval(processingIntervalRef.current); processingIntervalRef.current = null; }
  };

  const startProcessingSimulation = (isPdf: boolean) => {
    clearProcessingTimer();
    processingIntervalRef.current = window.setInterval(() => {
      setQueueItem((cur) => {
        if (!cur || cur.status === "completed" || cur.status === "error") return cur;
        return {
          ...cur,
          status: "processing",
          textProgress: Math.min(cur.textProgress + 4, 92),
          renderProgress: cur.isPdf ? Math.min(cur.renderProgress + 3, 88) : 100,
          detail: isPdf
            ? "Analysing structural data"
            : "Extracting text structure",
        };
      });
    }, 260);
  };

  const finalizeQueue = (status: QueueStatus, detail: string) => {
    clearProcessingTimer();
    setQueueItem((cur) =>
      cur ? { ...cur, status, uploadProgress: status === "error" ? cur.uploadProgress : 100, textProgress: status === "error" ? cur.textProgress : 100, renderProgress: status === "error" ? cur.renderProgress : 100, detail } : cur
    );
  };

  /* ── upload ── */
  const beginUpload = (file: File) => {
    setUploadError(null);
    setUploading(true);
    const isPdf = file.name.toLowerCase().endsWith(".pdf");

    setQueueItem({
      id: `${Date.now()}`,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
      isPdf,
      uploadProgress: 0, textProgress: 0, renderProgress: isPdf ? 0 : 100,
      status: "uploading",
      detail: "Uploading document securely",
    });

    startProcessingSimulation(isPdf);

    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${FLASK_API_URL}/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const p = (e.loaded / e.total) * 100;
      setQueueItem((cur) => cur ? { ...cur, uploadProgress: p, detail: p < 100 ? "Transferring document" : cur.detail } : cur);
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadError("Cannot connect to backend. Make sure Flask is running on port 5000.");
      finalizeQueue("error", "Upload connection failed.");
    };

    xhr.onload = () => {
      setUploading(false);
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300 && data.ok && data.doc_id) {
          finalizeQueue("completed", "Document is ready.");
          window.setTimeout(() => { window.location.href = `${NEXTJS_ANALYSIS_URL}?doc_id=${data.doc_id}`; }, 700);
          return;
        }
        const err = data.error || data.detail || "Upload failed";
        setUploadError(err);
        finalizeQueue("error", err);
      } catch {
        setUploadError("Upload completed but the response could not be read.");
        finalizeQueue("error", "Invalid response.");
      }
    };

    xhr.send(formData);
  };

  const handleFileSelection = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length) return;
    beginUpload(files[0]);
    e.target.value = "";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragActive(false); };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) beginUpload(files[0]);
  };

  const handleLogout = async () => {
    setSigningOut(true);
    try { await fetch(`${FLASK_API_URL}/api/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    startTransition(() => router.replace("/"));
  };

  /* ═══════════════ loading state ═══════════════ */
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] text-slate-700">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#0f4c81]" />
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Opening dashboard</p>
        </div>
      </main>
    );
  }

  /* combined queue progress for the single active item */
  const combinedProgress = queueItem
    ? Math.round((queueItem.uploadProgress + queueItem.textProgress + (queueItem.isPdf ? queueItem.renderProgress : 100)) / 3)
    : 0;

  /* ═══════════════════════════════════════════════════════════════════ */
  /*                             RENDER                                  */
  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fa] text-[#1a2332]" style={{ fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.csv,.xlsx,.docx,.txt,.md,.png,.jpg,.jpeg" className="hidden" onChange={handleFileSelection} disabled={uploading} />

      {/* ════════════════ TOP NAVBAR ════════════════ */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        {/* left: logo + nav */}
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-[#0f4c81]" />
            <span className="text-[0.95rem] font-bold tracking-[-0.01em] text-[#0f4c81]">DocuMind</span>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {["WORKSPACE", "LIBRARY", "INSIGHTS"].map((tab) => (
              <button
                key={tab}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold tracking-[0.08em] transition ${
                  tab === "WORKSPACE"
                    ? "bg-[#edf2f9] text-[#0f4c81]"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* right: icons + avatar */}
        <div className="flex items-center gap-3">
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <Bell className="h-[18px] w-[18px]" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={handleLogout}
            disabled={signingOut}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0f4c81] text-xs font-bold text-white transition hover:bg-[#0d3f6d] disabled:opacity-60"
            title={signingOut ? "Signing out…" : `${user?.email} — Sign out`}
          >
            {signingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (user?.email?.[0] || "U").toUpperCase()}
          </button>
        </div>
      </header>

      {/* ════════════════ BODY (sidebar + main) ════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ──────── LEFT SIDEBAR ──────── */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-white py-6 lg:flex">
          {/* curator title */}
          <div className="px-5">
            <p className="text-sm font-bold text-[#1a2332]">Document Curator</p>
            <p className="mt-0.5 text-xs text-slate-400">Analytical Workspace</p>
          </div>

          {/* nav items */}
          <nav className="mt-8 flex flex-col gap-0.5 px-3">
            {[
              { icon: Clock, label: "Recent Docs", active: true },
              { icon: Pin, label: "Pinned", active: false },
              { icon: Share2, label: "Shared", active: false },
              { icon: Archive, label: "Archived", active: false },
            ].map(({ icon: Icon, label, active }) => (
              <button
                key={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-[#edf2f9] text-[#0f4c81]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ──────── MAIN CONTENT ──────── */}
        <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
          {/* breadcrumb + title row */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#0f4c81] transition hover:text-[#0d3f6d]">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Workspace
              </button>
              <h1 className="text-[1.65rem] font-bold tracking-[-0.03em] text-[#1a2332]">Ingest Analytias</h1>
            </div>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f4c81] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0d3f6d]">
              <Sparkles className="h-4 w-4" />
              Begin Extraction
            </button>
          </div>

          {/* ── Two-column grid ── */}
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(340px,480px)_1fr]">

            {/* ═══ LEFT COLUMN ═══ */}
            <div className="flex flex-col gap-6">

              {/* Upload drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragActive
                    ? "border-[#0f4c81] bg-blue-50/60"
                    : "border-slate-300 bg-white"
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Upload className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#1a2332]">Drop your ledgers here</h3>
                <p className="mt-2 max-w-[22rem] text-sm leading-relaxed text-slate-500">
                  PDF, XLSX, or CSV. Max 50MB per file. AI will automatically detect schema.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="mt-6 inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-[#1a2332] shadow-sm transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {uploading ? "Uploading…" : "Select from Computer"}
                </button>
              </div>

              {/* upload error banner */}
              {uploadError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {uploadError}
                </div>
              )}

              {/* Set Information Rules (placeholder) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#0f4c81]" />
                  <h3 className="text-[0.95rem] font-bold text-[#1a2332]">Set Information Rules</h3>
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Extraction Deep-Scan</p>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-[#0f4c81]" />
                    <span className="text-sm font-medium text-[#1a2332]">Financial Reconciliation</span>
                  </div>
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-[#0f4c81] text-white">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                </div>

                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Custom Entities</p>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <span className="text-sm text-slate-400">Add fields to find (e.g. VAT ID)</span>
                  <Plus className="h-4 w-4 text-slate-400" />
                </div>

                {/* AI insight banner */}
                <div className="mt-5 rounded-lg bg-[#edf2f9] px-4 py-3">
                  <p className="text-sm leading-relaxed text-[#0f4c81]">
                    <span className="font-semibold">AI Insight:</span>{" "}
                    85% of your recent documents use the &quot;Quarterly Tax&quot; schema. Apply this template?
                  </p>
                </div>
              </div>
            </div>

            {/* ═══ RIGHT COLUMN ═══ */}
            <div className="flex flex-col gap-6">

              {/* Queue section */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[0.95rem] font-bold text-[#1a2332]">
                    Queue {queueItem ? "(1)" : "(0)"}
                  </h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      queueItem?.status === "processing" || queueItem?.status === "uploading"
                        ? "bg-emerald-50 text-emerald-600"
                        : queueItem?.status === "completed"
                          ? "bg-emerald-50 text-emerald-600"
                          : queueItem?.status === "error"
                            ? "bg-rose-50 text-rose-600"
                            : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {queueStatusLabel}
                  </span>
                </div>

                {queueItem ? (
                  <div className="mt-4">
                    {/* active file row */}
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-500">
                        {queueItem.isPdf ? <FileText className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#1a2332]">{queueItem.name}</p>
                        <p className="text-xs text-slate-400">{queueItem.sizeLabel} • {queueItem.detail}</p>
                      </div>
                      {queueItem.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                      ) : queueItem.status === "error" ? (
                        <span className="shrink-0 text-xs font-semibold text-rose-500">Error</span>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <MiniProgress value={combinedProgress} />
                          <span className="text-xs font-bold text-[#0f4c81]">{combinedProgress}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* placeholder queue items when nothing is uploading */
                  <div className="mt-4 space-y-3">
                    {/* placeholder 1 */}
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 opacity-50">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-400">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-400">Q3_Tax_Summary_V2.pdf</p>
                        <p className="text-xs text-slate-300">2.4 MB • Awaiting upload</p>
                      </div>
                      <MiniProgress value={0} />
                    </div>
                    {/* placeholder 2 */}
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 opacity-50">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-400">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-400">Invoices_Batch_88.xlsx</p>
                        <p className="text-xs text-slate-300">12.1 MB • Schema identified</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Ready
                      </span>
                    </div>
                    {/* placeholder 3 */}
                    <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 opacity-50">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-400">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-400">Receipt_Scan_001.png</p>
                        <p className="text-xs text-slate-300">450 KB • OCR in progress</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <span className="h-2 w-2 rounded-full bg-slate-300" />
                        Waiting
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Past Documents (placeholder) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[0.95rem] font-bold text-[#1a2332]">Past Documents</h3>
                  <button className="text-xs font-semibold text-[#0f4c81] transition hover:underline">View Library</button>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {/* past doc card 1 */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between">
                      <FolderOpen className="h-5 w-5 text-slate-400" />
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Oct 12</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#1a2332]">FY24 Annual Report</p>
                    <p className="mt-1 text-xs text-slate-400">Extracted 12,402 entries…</p>
                  </div>
                  {/* past doc card 2 */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Oct 10</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#1a2332]">Payroll_Snapshot_Main</p>
                    <p className="mt-1 text-xs text-slate-400">Secure vault storage…</p>
                  </div>
                </div>
              </div>

              {/* Recommended Action (placeholder) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] text-[#0f4c81]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Recommended Action
                </p>
                <p className="mt-2 text-sm font-bold text-[#1a2332]">Combine Monthly Reports</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Our AI detected 3 similar files. Create a merged workspace?
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
