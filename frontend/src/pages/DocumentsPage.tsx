import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

type Document = {
  doc_id: string;
  filename: string;
  total_pages: number | null;
  size_bytes: number;
  size_display: string;
  status: string;
  created_at: string;
};

type DocumentsApiResponse = {
  ok: boolean;
  documents: Document[];
  total: number;
};

type AuthMeResponse = {
  ok: boolean;
  email: string;
};

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// Cycle through these gradients to give each doc a distinct colour identity
const DOC_COLORS = [
  "from-violet-500/20 to-indigo-500/20 border-violet-500/20 text-violet-300",
  "from-cyan-500/20 to-blue-500/20 border-cyan-500/20 text-cyan-300",
  "from-emerald-500/20 to-teal-500/20 border-emerald-500/20 text-emerald-300",
  "from-rose-500/20 to-pink-500/20 border-rose-500/20 text-rose-300",
  "from-amber-500/20 to-orange-500/20 border-amber-500/20 text-amber-300",
  "from-fuchsia-500/20 to-purple-500/20 border-fuchsia-500/20 text-fuchsia-300",
];

function docColor(index: number) {
  return DOC_COLORS[index % DOC_COLORS.length];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreetingName(email: string): string {
  if (!email) return "there";
  const localPart = email.split("@")[0] ?? "";
  return (
    localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || "there"
  );
}

function getInitials(email: string): string {
  return (
    getGreetingName(email)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "DM"
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const wks = Math.floor(days / 7);
  if (wks === 1) return "1 week ago";
  if (wks < 5) return `${wks} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(${escaped})`, "gi"), "|||$1|||");
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = highlightMatch(text, query).split("|||");
  const q = query.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q ? (
          <mark key={i} className="bg-violet-500/30 text-violet-200 rounded-sm px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 bg-[#0e0e1a] border border-white/[0.07] rounded-2xl p-4 animate-pulse">
      <div className="h-12 w-12 rounded-xl bg-white/[0.06] flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/5 rounded bg-white/[0.06]" />
        <div className="h-3 w-2/5 rounded bg-white/[0.04]" />
      </div>
      <div className="h-5 w-16 rounded-full bg-white/[0.04] flex-shrink-0" />
    </div>
  );
}

function EmptyState({ query, onUpload }: { query: string; onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-5">
        <FolderIcon className="h-8 w-8 text-zinc-600" />
      </div>
      {query ? (
        <>
          <p className="text-base font-medium text-zinc-400 mb-1">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-sm text-zinc-600">Try a different name or clear the search</p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-zinc-400 mb-1">No documents yet</p>
          <p className="text-sm text-zinc-600 mb-6">Upload your first document to get started</p>
          <button
            onClick={onUpload}
            className="flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/20"
          >
            <UploadIcon className="h-4 w-4" />
            Upload document
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const navigate = useNavigate();

  // User
  const [userEmail, setUserEmail] = useState("");

  // All documents fetched
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Visible slice for infinite scroll
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Sentinel ref for intersection observer
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Upload ─────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setUploadState("uploading");
    setUploadProgress(10);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    let progressInterval: NodeJS.Timeout | null = null;
    try {
      // Simulate fast network progress for the UI while fetch runs
      progressInterval = setInterval(() => {
        setUploadProgress((p) => (p < 85 ? p + 5 : p));
      }, 100);

      const res = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      
      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Wait a moment so the 100% is visible
      setTimeout(() => {
        setUploadState("idle");
        navigate(`/document/${data.doc_id}`);
      }, 500);

    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      setUploadState("idle");
      setError(err.message || "Failed to upload document");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // ── Debounce search ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset visible count whenever search changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedQuery]);

  // ── Fetch user + documents ─────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [authRes, docsRes] = await Promise.all([
          fetch("/api/auth/me", { credentials: "same-origin", signal: controller.signal }),
          fetch("/api/dashboard/documents", { credentials: "same-origin", signal: controller.signal }),
        ]);

        if (authRes.status === 401 || docsRes.status === 401) {
          navigate("/signin", { replace: true });
          return;
        }

        const authData: AuthMeResponse = await authRes.json();
        const docsData: DocumentsApiResponse = await docsRes.json();

        if (!authData.ok) throw new Error("Unable to load your session.");
        if (!docsData.ok) throw new Error("Unable to load documents.");

        setUserEmail(authData.email);
        setAllDocs(docsData.documents ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load documents.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [navigate]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filteredDocs = debouncedQuery.trim()
    ? allDocs.filter((d) =>
        d.filename.toLowerCase().includes(debouncedQuery.toLowerCase())
      )
    : allDocs;

  const visibleDocs = filteredDocs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredDocs.length;

  // ── Infinite scroll observer ───────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Small delay so the sentinel doesn't immediately retrigger
    setTimeout(() => {
      setVisibleCount((c) => c + PAGE_SIZE);
      setLoadingMore(false);
    }, 400);
  }, [loadingMore, hasMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const greetingName = getGreetingName(userEmail);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#0a0a0f] text-white"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="flex min-h-screen">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-60 border-r border-white/[0.06] bg-[#0c0c14] py-5">
          {/* Logo */}
          <div className="px-5 mb-8">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 group"
            >
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <DocumentIcon className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-white font-semibold text-base tracking-tight">
                Docu<span className="text-violet-400">mind</span>
              </span>
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 space-y-1">
            {[
              { icon: <GridIcon className="h-4 w-4" />, label: "Dashboard", path: "/dashboard", active: false },
              { icon: <FolderIcon className="h-4 w-4" />, label: "Documents", path: "/documents", active: true },
              { icon: <ChatIcon className="h-4 w-4" />, label: "Conversations", path: "/conversations", active: false },
              { icon: <SearchNavIcon className="h-4 w-4" />, label: "Search", path: "/search", active: false },
              { icon: <SettingsIcon className="h-4 w-4" />, label: "Settings", path: "/settings", active: false },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  item.active
                    ? "bg-violet-500/15 border border-violet-500/25 text-violet-200 font-medium"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                )}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* User */}
          <div className="px-3 pt-4 border-t border-white/[0.06] mt-4">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors duration-200">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                {getInitials(userEmail)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{greetingName}</p>
                <p className="text-xs text-zinc-500 truncate">{userEmail || "Loading…"}</p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-30">
            <div>
              <h1 className="text-xl font-bold text-white">Documents</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                {loading ? "Loading…" : `${filteredDocs.length} document${filteredDocs.length !== 1 ? "s" : ""}${debouncedQuery ? ` for "${debouncedQuery}"` : ""}`}
              </p>
            </div>
            <button
              onClick={handleUploadClick}
              className="flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/20"
            >
              <UploadIcon className="h-4 w-4" />
              Upload document
            </button>
          </div>

          <div className="p-8 max-w-4xl">
            {/* Error banner */}
            {error && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <AlertIcon className="h-5 w-5 flex-shrink-0 text-red-300 mt-0.5" />
                <div>
                  <p className="font-medium">Could not load documents.</p>
                  <p className="text-red-200/80 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* Search bar */}
            <div className="relative mb-6">
              <SearchNavIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents by name…"
                className={cn(
                  "w-full bg-[#0e0e1a] border border-white/[0.08] rounded-2xl pl-11 pr-10 py-3 text-sm text-white placeholder-zinc-600",
                  "focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10",
                  "transition-all duration-200"
                )}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
                  aria-label="Clear search"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Document list */}
            <div className="space-y-2.5">
              {loading ? (
                // Skeleton loading rows
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredDocs.length === 0 ? (
                <EmptyState query={debouncedQuery} onUpload={handleUploadClick} />
              ) : (
                <>
                  {visibleDocs.map((doc, idx) => (
                    <DocumentRow
                      key={doc.doc_id}
                      doc={doc}
                      index={idx}
                      query={debouncedQuery}
                      onClick={() => navigate(`/document/${doc.doc_id}`)}
                    />
                  ))}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="h-1" />

                  {/* Loading more indicator */}
                  {loadingMore && (
                    <div className="flex justify-center py-4">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <SpinnerIcon className="h-4 w-4 animate-spin text-violet-400" />
                        Loading more…
                      </div>
                    </div>
                  )}

                  {/* End of list */}
                  {!hasMore && filteredDocs.length > PAGE_SIZE && (
                    <p className="text-center text-xs text-zinc-700 py-4">
                      All {filteredDocs.length} documents loaded
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".pdf,.docx,.txt,.csv,.md,.png,.jpg,.jpeg,.webp"
      />

      {/* Upload progress overlay */}
      {uploadState === "uploading" && (
        <div className="fixed inset-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-[#12121c] border border-white/10 rounded-2xl p-10 w-full max-w-sm mx-4 overflow-hidden shadow-2xl">
            {/* Glow */}
            <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(109,40,217,0.5) 0%, transparent 70%)" }} />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

            <div className="relative z-10">
              {/* Animated icon */}
              <div className="h-16 w-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-violet-500/5 animate-pulse" />
                <svg className="h-7 w-7 text-violet-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ animationDuration: "2s" }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>

              {/* Current step */}
              <div className="text-center mb-6">
                <p className="text-white font-semibold text-lg mb-1">
                  Uploading document...
                </p>
                {uploadedFileName && (
                  <p className="text-xs text-zinc-500 truncate max-w-xs mx-auto">{uploadedFileName}</p>
                )}
              </div>

              {/* Progress bar */}
              <div className="bg-white/5 rounded-full h-1.5 mb-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                  style={{ width: `${uploadProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────

function DocumentRow({
  doc,
  index,
  query,
  onClick,
}: {
  doc: Document;
  index: number;
  query: string;
  onClick: () => void;
}) {
  const colorClass = docColor(index);
  const ext = doc.filename.split(".").pop()?.toUpperCase() ?? "DOC";

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-[#0e0e1a] border border-white/[0.07] hover:border-violet-500/30 rounded-2xl p-4 cursor-pointer group transition-all duration-200 hover:bg-[#12122a]/60 text-left"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* File type icon */}
      <div
        className={cn(
          "h-12 w-12 rounded-xl bg-gradient-to-br border flex flex-col items-center justify-center flex-shrink-0 gap-0.5",
          colorClass
        )}
      >
        <DocumentIcon className="h-4 w-4" />
        <span className="text-[9px] font-bold tracking-wide opacity-80">{ext}</span>
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate group-hover:text-violet-200 transition-colors duration-200">
          <HighlightedText text={doc.filename} query={query} />
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {doc.total_pages != null ? `${doc.total_pages} pages · ` : ""}
          {doc.size_display} · {relativeTime(doc.created_at)}
        </p>
      </div>

      {/* Status + arrow */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 font-medium">
          <CheckIcon className="h-3 w-3" />
          Ready
        </span>
        <ArrowRightIcon className="h-4 w-4 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all duration-200" />
      </div>
    </button>
  );
}

// ─── Icons (all inline, zero dependencies) ────────────────────────────────────

function ip(className?: string) {
  return {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
  };
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}
function GridIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function ChatIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function SearchNavIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.22.74.6 1 .34.22.73.34 1.13.34H21a2 2 0 1 1 0 4h-.09c-.4 0-.79.12-1.13.34-.38.26-.6.62-.6 1.02Z" />
    </svg>
  );
}
function UploadIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
function AlertIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg {...ip(className)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
