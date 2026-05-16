import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";

type UploadState = "idle" | "uploading";

const WORKFLOW_POINTS = [
  "Store the document and text in the backend",
  "Extract blocks, tables, and figures",
  "Index representative chunks for grounded answers",
  "Open a live document workspace with AI summary",
];

export default function TryPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");

  const handleUploadClick = () => fileInputRef.current?.click();

  const uploadFile = async (file: File) => {
    setUploadedFileName(file.name);
    setUploadState("uploading");
    setUploadProgress(10);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    try {
      progressInterval = setInterval(() => {
        setUploadProgress((current) => (current < 88 ? current + 4 : current));
      }, 120);

      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.doc_id) {
        throw new Error(data.error || "Upload failed");
      }

      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      window.setTimeout(() => {
        navigate(`/document/${data.doc_id}`, {
          state: pendingQuestion.trim() ? { pendingQuestion: pendingQuestion.trim() } : undefined,
        });
      }, 350);
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      setUploadState("idle");
      setUploadProgress(0);
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  return (
    <div className="h-screen overflow-hidden bg-[#0a0a0f] text-white flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-xl sticky top-0 z-40">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Docu<span className="text-violet-400">mind</span></span>
        </button>

        <div className="flex items-center gap-2.5">
          <button onClick={() => navigate("/signin")} className="text-sm text-zinc-400 hover:text-white transition-colors px-3 py-1.5">
            Sign in
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="text-sm font-medium bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-white px-4 py-2 rounded-lg transition-all duration-200"
          >
            Dashboard
          </button>
        </div>
      </header>

      {uploadState === "uploading" && (
        <div className="fixed inset-0 z-50 bg-[#0a0a0f]/92 backdrop-blur-sm flex items-center justify-center">
          <div className="relative bg-[#12121c] border border-white/10 rounded-2xl p-10 w-full max-w-sm mx-4 overflow-hidden shadow-2xl">
            <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(109,40,217,0.5) 0%, transparent 70%)" }} />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
            <div className="relative z-10">
              <div className="h-16 w-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-6 relative">
                <div className="absolute inset-0 rounded-2xl bg-violet-500/5 animate-pulse" />
                <svg className="h-7 w-7 text-violet-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ animationDuration: "2s" }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="text-center mb-6">
                <p className="text-white font-semibold text-lg mb-1">Uploading and indexing document...</p>
                {uploadedFileName && <p className="text-xs text-zinc-500 truncate max-w-xs mx-auto">{uploadedFileName}</p>}
              </div>
              <div className="bg-white/5 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                  style={{ width: `${uploadProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2 text-xs text-zinc-400">
                {WORKFLOW_POINTS.map((point, index) => {
                  const active = uploadProgress >= (index + 1) * 20;
                  return (
                    <div key={point} className={cn("flex items-center gap-3 transition-colors duration-200", active ? "text-zinc-200" : "text-zinc-600")}>
                      <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center", active ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/5")}>
                        <div className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-violet-400" : "bg-zinc-600")} />
                      </div>
                      {point}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex flex-col w-80 border-r border-white/[0.06] bg-[#0c0c14]">
          <div className="p-6 border-b border-white/[0.06]">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">New Analysis</div>
            <div className="bg-gradient-to-b from-white/[0.05] to-transparent border border-white/[0.08] rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="h-5 w-5 text-violet-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{uploadedFileName ?? "Upload a document"}</p>
                  <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, TXT, CSV, Markdown, or image-based documents</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="bg-white/[0.04] rounded-xl p-3">
                  <div className="text-sm font-semibold text-white">Blocks</div>
                  <div className="text-[11px] text-zinc-500 mt-1">Structured text, pages, and citations</div>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3">
                  <div className="text-sm font-semibold text-white">Summary</div>
                  <div className="text-[11px] text-zinc-500 mt-1">Representative chunks with grounded bullets</div>
                </div>
              </div>
            </div>

            <button
              onClick={handleUploadClick}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-dashed border-white/10 hover:border-violet-500/30 rounded-xl py-3.5 text-sm text-zinc-300 hover:text-violet-200 font-medium transition-all duration-200"
            >
              <UploadIcon />
              Upload document
            </button>
            <p className="text-center text-[11px] text-zinc-600 mt-2">The uploaded file will open in a live workspace at `/document/:doc_id`.</p>
          </div>

          <div className="p-6">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">Processing Flow</div>
            <div className="space-y-3">
              {WORKFLOW_POINTS.map((point, index) => (
                <div key={point} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{point}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-10 lg:py-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 mb-5">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                Backend-wired upload flow
              </div>

              <h1 className="text-4xl lg:text-5xl font-semibold tracking-tight text-white leading-tight max-w-3xl">
                Upload a document and open a grounded AI workspace in one step.
              </h1>
              <p className="text-zinc-400 text-base lg:text-lg leading-relaxed max-w-2xl mt-5">
                The upload now stores the document in the database, extracts blocks, queues table and figure analysis, and routes the result to a live document page with summary and chat.
              </p>

              <div className="grid lg:grid-cols-[1.25fr,0.95fr] gap-6 mt-10">
                <div className="bg-[#0e0e1a] border border-white/[0.08] rounded-3xl p-6 lg:p-7">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-[0.24em]">Upload</p>
                      <p className="text-white text-lg font-semibold mt-2">Start with your document</p>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                      <UploadIcon className="text-white" />
                    </div>
                  </div>

                  <button
                    onClick={handleUploadClick}
                    className="w-full min-h-56 border border-dashed border-white/10 hover:border-violet-500/35 rounded-3xl bg-gradient-to-br from-white/[0.03] to-violet-500/[0.04] transition-all duration-200 flex flex-col items-center justify-center text-center px-6"
                  >
                    <div className="h-16 w-16 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mb-5">
                      <UploadIcon className="text-violet-300" />
                    </div>
                    <p className="text-white font-medium text-lg">Drop files here or click to upload</p>
                    <p className="text-sm text-zinc-500 mt-2 max-w-md">
                      Your upload will be stored and analyzed, then we’ll take you straight to the document workspace.
                    </p>
                  </button>

                  {error && (
                    <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {error}
                    </div>
                  )}
                </div>

                <div className="bg-[#0e0e1a] border border-white/[0.08] rounded-3xl p-6 lg:p-7">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-11 w-11 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                      <SparkIcon className="text-zinc-200" />
                    </div>
                    <div>
                      <p className="text-white text-lg font-semibold">Ask after upload</p>
                      <p className="text-sm text-zinc-500">We’ll carry this intent into the document workspace.</p>
                    </div>
                  </div>

                  <div className="bg-[#0a0a0f] border border-white/[0.08] rounded-2xl px-4 py-3">
                    <textarea
                      value={pendingQuestion}
                      onChange={(event) => setPendingQuestion(event.target.value)}
                      placeholder="Example: Summarize the financial performance and highlight the major risks."
                      rows={6}
                      className="w-full bg-transparent text-sm text-white placeholder-zinc-600 resize-none focus:outline-none leading-relaxed"
                    />
                    <div className="flex items-center justify-between gap-3 mt-4">
                      <p className="text-[11px] text-zinc-600">Upload from here or from the left panel. Both now hit the backend.</p>
                      <button
                        onClick={handleUploadClick}
                        className="h-10 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-violet-500/20"
                      >
                        Upload
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {[
                      "AI summary with representative citations",
                      "Page, table, and figure navigation",
                      "Grounded Q&A over retrieved evidence",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm text-zinc-400">
                        <div className="h-5 w-5 rounded-full bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </div>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.csv,.md,.xlsx,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h8l-1 8 11-14h-8l1-6z" />
    </svg>
  );
}
