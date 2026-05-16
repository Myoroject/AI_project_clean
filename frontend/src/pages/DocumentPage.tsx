import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { cn } from "../utils/cn";
import ProcessingLoader from "../components/doc/ProcessingLoader";

type DocMeta = {
  doc_id: string;
  filename: string;
  size: number;
  status: string;
  total_pages: number | null;
  table_count: number;
  chart_count: number;
};

type OutlinePage = {
  page_number: number;
  title: string;
  preview: string;
  table_count: number;
  figure_count: number;
};

type OutlineTable = {
  table_id: string;
  page_number: number;
  title: string;
  row_count: number | null;
  column_count: number | null;
  preview: string;
};

type OutlineFigure = {
  visual_id: string;
  page_number: number;
  title: string;
  block_type: string;
};

type SummaryCitation = {
  evidence_id: string;
  block_id: string;
  page: number;
  block_type: string;
  source_type: string;
  label: string;
};

type SummaryBullet = {
  text: string;
  citations: SummaryCitation[];
};

type DocumentSummary = {
  overview: string;
  overview_citations: SummaryCitation[];
  bullets: SummaryBullet[];
};

type OutlinePayload = {
  pages: OutlinePage[];
  tables: OutlineTable[];
  figures: OutlineFigure[];
};

type PageBlock = {
  block_id: string;
  text: string;
  block_type: string;
  y1?: number;
  x1?: number;
};

type PagePayload = {
  page_number: number;
  page_text: string;
  blocks: PageBlock[];
};

type MessageCitation = {
  rank: number;
  block_id: string;
  text: string;
  page: number;
  block_type: string;
  score: number;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: MessageCitation[];
  loading?: boolean;
};

const QUICK_QUESTIONS = [
  "Give me the key takeaways",
  "What are the main numbers and metrics?",
  "What risks or concerns are mentioned?",
  "Which pages matter most for a quick read?",
];

export default function DocumentPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingQuestionRef = useRef<string | null>((location.state as { pendingQuestion?: string } | null)?.pendingQuestion ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc] = useState<DocMeta | null>(null);
  const [status, setStatus] = useState<"loading" | "processing" | "ready" | "error">("loading");
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [outline, setOutline] = useState<OutlinePayload>({ pages: [], tables: [], figures: [] });
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rightPanelPage, setRightPanelPage] = useState(1);
  const [activeHighlightText, setActiveHighlightText] = useState<string | null>(null);
  const [activeHighlightBlockId, setActiveHighlightBlockId] = useState<string | null>(null);
  const [pageCache, setPageCache] = useState<Record<number, PagePayload>>({});
  const [uploadState, setUploadState] = useState<"idle" | "uploading">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const currentPage = pageCache[rightPanelPage];
  const pageCount = doc?.total_pages ?? outline.pages.length ?? 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!docId) return;

    let aborted = false;

    const loadDocument = async () => {
      try {
        setStatus("loading");
        setError(null);
        const response = await fetch(`/api/document/${docId}`);

        if (response.status === 401) {
          navigate(`/signin?next=/document/${docId}`);
          return;
        }

        if (response.status === 404) {
          if (!aborted) setStatus("error");
          return;
        }

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Unable to load document");
        }

        if (aborted) return;
        const nextDoc: DocMeta = {
          doc_id: data.doc_id,
          filename: data.filename,
          size: data.size,
          status: data.status,
          total_pages: data.total_pages,
          table_count: data.table_count,
          chart_count: data.chart_count,
        };
        setDoc(nextDoc);
        setStatus(nextDoc.status === "ready" ? "ready" : "processing");
      } catch (err) {
        if (aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load document");
        setStatus("error");
      }
    };

    loadDocument();
    return () => {
      aborted = true;
    };
  }, [docId, navigate]);

  useEffect(() => {
    if (status !== "processing" || !docId) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/document/${docId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!data.ok) return;

        const nextDoc: DocMeta = {
          doc_id: data.doc_id,
          filename: data.filename,
          size: data.size,
          status: data.status,
          total_pages: data.total_pages,
          table_count: data.table_count,
          chart_count: data.chart_count,
        };

        setDoc(nextDoc);
        if (nextDoc.status === "ready") {
          setStatus("ready");
        }
      } catch {
        // Ignore poll errors and keep waiting.
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [docId, status]);

  useEffect(() => {
    if (status !== "ready" || !docId) return;

    let aborted = false;

    const loadWorkspace = async () => {
      try {
        setWorkspaceError(null);
        const [summaryResponse, outlineResponse] = await Promise.all([
          fetch(`/api/document/${docId}/summary`),
          fetch(`/api/document/${docId}/outline`),
        ]);

        const summaryData = await summaryResponse.json();
        const outlineData = await outlineResponse.json();

        if (!summaryResponse.ok || !summaryData.ok) {
          throw new Error(summaryData.error || "Unable to generate summary");
        }

        if (!outlineResponse.ok || !outlineData.ok) {
          throw new Error(outlineData.error || "Unable to load document outline");
        }

        if (aborted) return;

        setSummary(summaryData.summary);
        setOutline({
          pages: outlineData.pages ?? [],
          tables: outlineData.tables ?? [],
          figures: outlineData.figures ?? [],
        });

        const firstPage = outlineData.pages?.[0]?.page_number ?? 1;
        setRightPanelPage((current) => (current > 0 ? current : firstPage));

        if (pendingQuestionRef.current) {
          const question = pendingQuestionRef.current;
          pendingQuestionRef.current = null;
          setInputValue("");
          void sendQuestion(question);
        }
      } catch (err) {
        if (aborted) return;
        setWorkspaceError(err instanceof Error ? err.message : "Unable to load document workspace");
      }
    };

    loadWorkspace();
    return () => {
      aborted = true;
    };
  }, [docId, status]);

  useEffect(() => {
    if (!rightPanelOpen || !docId || !rightPanelPage || pageCache[rightPanelPage]) return;

    let aborted = false;
    const loadPage = async () => {
      try {
        const response = await fetch(`/api/document/${docId}/page/${rightPanelPage}`);
        const data = await response.json();
        if (!response.ok || !data.ok || aborted) return;

        setPageCache((current) => ({
          ...current,
          [rightPanelPage]: {
            page_number: data.page_number,
            page_text: data.page_text,
            blocks: data.blocks ?? [],
          },
        }));
      } catch {
        // keep panel open; the user can still navigate
      }
    };

    loadPage();
    return () => {
      aborted = true;
    };
  }, [docId, pageCache, rightPanelOpen, rightPanelPage]);

  const openPage = (pageNumber: number, options?: { blockId?: string | null; text?: string | null }) => {
    setRightPanelOpen(true);
    setRightPanelPage(pageNumber);
    setActiveHighlightBlockId(options?.blockId ?? null);
    setActiveHighlightText(options?.text ?? null);
  };

  const uploadReplacementDocument = async (file: File) => {
    setUploadedFileName(file.name);
    setUploadState("uploading");
    setUploadProgress(10);

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
      window.setTimeout(() => navigate(`/document/${data.doc_id}`), 350);
    } catch (err) {
      if (progressInterval) clearInterval(progressInterval);
      setUploadState("idle");
      setUploadProgress(0);
      setWorkspaceError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadReplacementDocument(file);
  };

  const sendQuestion = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? inputValue).trim();
    if (!question || !docId) return;

    if (!overrideQuestion) {
      setInputValue("");
    }

    const loadingId = `loading-${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: question },
      { id: loadingId, role: "assistant", content: "", loading: true },
    ]);

    try {
      const response = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, doc_id: docId }),
      });
      const data = await response.json();

      setMessages((current) =>
        current.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                loading: false,
                content: data.answer || "I couldn't generate an answer for that question.",
                citations: data.citations || [],
              }
            : message
        )
      );
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === loadingId
            ? {
                ...message,
                loading: false,
                content: "Network error while asking the document. Please try again.",
              }
            : message
        )
      );
    }
  };

  const summaryMeta = useMemo(() => {
    const pages = doc?.total_pages ?? outline.pages.length ?? 0;
    const tables = doc?.table_count ?? outline.tables.length ?? 0;
    const figures = doc?.chart_count ?? outline.figures.length ?? 0;
    return { pages, tables, figures };
  }, [doc, outline]);

  return (
    <div className="h-screen overflow-hidden bg-[#0a0a0f] text-white flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-xl sticky top-0 z-40">
        <button onClick={() => navigate("/documents")} className="flex items-center gap-2 group">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <DocumentIcon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">Docu<span className="text-violet-400">mind</span></span>
        </button>

        <div className="min-w-0 px-4">
          <div className="text-[11px] uppercase tracking-[0.25em] text-zinc-600 text-center">Document Workspace</div>
          <div className="text-sm text-zinc-300 truncate max-w-[360px] text-center">{doc?.filename || docId}</div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-zinc-300 hover:text-white transition-colors px-3 py-1.5 border border-white/[0.08] rounded-lg hover:bg-white/[0.05]"
          >
            Upload new
          </button>
          <button
            onClick={() => navigate("/documents")}
            className="text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg transition-all duration-200 shadow-lg shadow-violet-500/20"
          >
            Documents
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
                <p className="text-white font-semibold text-lg mb-1">Uploading replacement document...</p>
                {uploadedFileName && <p className="text-xs text-zinc-500 truncate max-w-xs mx-auto">{uploadedFileName}</p>}
              </div>
              <div className="bg-white/5 rounded-full h-1.5 overflow-hidden">
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

      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex flex-col w-80 border-r border-white/[0.06] bg-[#0c0c14] overflow-hidden">
          <div className="p-5 border-b border-white/[0.06]">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Active Document</div>
            <div className="bg-gradient-to-b from-white/[0.05] to-transparent border border-white/[0.08] rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                  <DocumentIcon className="h-5 w-5 text-red-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-snug">{doc?.filename || "Document"}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{formatBytes(doc?.size ?? 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { label: "Pages", value: summaryMeta.pages },
                  { label: "Tables", value: summaryMeta.tables },
                  { label: "Figures", value: summaryMeta.figures },
                ].map((item) => (
                  <div key={item.label} className="bg-white/[0.04] rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-white">{item.value}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full mt-3 flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-dashed border-white/10 hover:border-violet-500/30 rounded-xl py-3 text-xs text-zinc-400 hover:text-violet-300 font-medium transition-all duration-200 group"
            >
              <UploadIcon className="h-4 w-4 group-hover:scale-110 transition-transform" />
              Upload another document
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            <OutlineSection title="Pages" count={outline.pages.length}>
              {outline.pages.map((page) => (
                <button
                  key={page.page_number}
                  onClick={() => openPage(page.page_number)}
                  className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] hover:border-violet-500/25 px-3 py-3 transition-all duration-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-white truncate">{page.title}</span>
                    <span className="text-[11px] text-zinc-500">p.{page.page_number}</span>
                  </div>
                  {page.preview && <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{page.preview}</p>}
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-600">
                    <span>{page.table_count} tables</span>
                    <span>{page.figure_count} figures</span>
                  </div>
                </button>
              ))}
            </OutlineSection>

            <OutlineSection title="Tables" count={outline.tables.length}>
              {outline.tables.length === 0 ? (
                <EmptyOutline label="No extracted tables yet" />
              ) : (
                outline.tables.map((table) => (
                  <button
                    key={table.table_id}
                    onClick={() => openPage(table.page_number, { text: table.title })}
                    className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] hover:border-violet-500/25 px-3 py-3 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-white leading-snug">{table.title}</span>
                      <span className="text-[11px] text-zinc-500">p.{table.page_number}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{table.preview || "Structured table extracted from this page."}</p>
                    <div className="text-[11px] text-zinc-600 mt-2">
                      {table.row_count ?? 0} rows · {table.column_count ?? 0} columns
                    </div>
                  </button>
                ))
              )}
            </OutlineSection>

            <OutlineSection title="Figures" count={outline.figures.length}>
              {outline.figures.length === 0 ? (
                <EmptyOutline label="No extracted figures yet" />
              ) : (
                outline.figures.map((figure) => (
                  <button
                    key={figure.visual_id}
                    onClick={() => openPage(figure.page_number, { text: figure.title })}
                    className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] hover:border-violet-500/25 px-3 py-3 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-white leading-snug">{figure.title}</span>
                      <span className="text-[11px] text-zinc-500">p.{figure.page_number}</span>
                    </div>
                    <div className="text-[11px] text-zinc-600 mt-2 uppercase tracking-wide">{figure.block_type || "figure"}</div>
                  </button>
                ))
              )}
            </OutlineSection>
          </div>
        </aside>

        <main className={cn("flex flex-col overflow-hidden transition-all duration-300", rightPanelOpen ? "flex-[0_0_58%] border-r border-white/[0.06]" : "flex-1")}>
          {status === "loading" && (
            <div className="flex-1 flex items-center justify-center">
              <SpinnerIcon className="h-8 w-8 text-violet-400 animate-spin" />
            </div>
          )}

          {status === "processing" && (
            <ProcessingLoader filename={doc?.filename || docId || "Document"} />
          )}

          {status === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="h-12 w-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <AlertIcon className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-red-200 font-medium text-center">{error || "Document not found or failed to load."}</p>
            </div>
          )}

          {status === "ready" && (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-6 pt-5 pb-8">
                  {workspaceError && (
                    <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {workspaceError}
                    </div>
                  )}

                  <div className="flex items-start gap-4 mb-4 bg-gradient-to-r from-violet-500/10 to-indigo-500/5 border border-violet-500/20 rounded-2xl p-5">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/30">
                      <SparkIcon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm mb-1">I've analyzed this document</p>
                      <p className="text-zinc-200 text-sm">
                        Here's a summary for <span className="text-zinc-100 font-medium">{doc?.filename || "your upload"}</span>, or ask your question below.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <MetaPill icon={<DocumentIcon className="h-3.5 w-3.5 text-zinc-400" />} text={`${summaryMeta.pages} pages`} />
                    <MetaPill icon={<TableIcon className="h-3.5 w-3.5 text-zinc-400" />} text={`${summaryMeta.tables} tables`} />
                    <MetaPill icon={<FigureIcon className="h-3.5 w-3.5 text-zinc-400" />} text={`${summaryMeta.figures} figures`} />
                    <MetaPill
                      className="bg-emerald-500/10 border-emerald-500/20"
                      icon={<CheckIcon className="h-3.5 w-3.5 text-emerald-400" />}
                      text="Fully analyzed"
                      textClassName="text-emerald-400 font-medium"
                    />
                  </div>

                  {summary && (
                    <div className="bg-[#0e0e1a] border border-white/[0.08] rounded-2xl overflow-hidden mb-6">
                      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                        <div className="h-2 w-2 rounded-full bg-violet-400" />
                        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">AI Summary</span>
                      </div>
                      <div className="p-5 space-y-5">
                        <div>
                          <p className="text-sm text-zinc-200 leading-relaxed">{summary.overview}</p>
                          <CitationRow citations={summary.overview_citations} onOpen={openPage} />
                        </div>

                        <div className="space-y-4">
                          {summary.bullets.map((bullet, index) => (
                            <div key={`${bullet.text}-${index}`} className="flex gap-3 items-start">
                              <div className="h-5 w-5 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[10px] font-bold text-violet-400">{index + 1}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-zinc-300 leading-relaxed">{bullet.text}</p>
                                <CitationRow citations={bullet.citations} onOpen={openPage} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.length === 0 && (
                    <div className="mb-6">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Quick questions</p>
                      <div className="flex flex-wrap gap-2">
                        {QUICK_QUESTIONS.map((question) => (
                          <button
                            key={question}
                            onClick={() => void sendQuestion(question)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm border transition-all duration-200 bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200"
                          >
                            <span>{question}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.length > 0 && (
                    <div className="space-y-6">
                      {messages.map((message) => (
                        <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "flex-row-reverse" : "flex-row")}>
                          {message.role === "assistant" && (
                            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-violet-500/20 mt-1">
                              <SparkIcon className="h-4 w-4 text-white" />
                            </div>
                          )}

                          <div className={cn("flex-1 max-w-[85%]", message.role === "user" ? "flex justify-end" : "")}>
                            {message.role === "user" ? (
                              <div className="inline-block bg-violet-600/30 border border-violet-500/30 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-violet-100">
                                {message.content}
                              </div>
                            ) : message.loading ? (
                              <div className="bg-[#0e0e1a] border border-white/[0.07] rounded-2xl rounded-tl-sm px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="flex gap-1">
                                    {[0, 1, 2].map((index) => (
                                      <div
                                        key={index}
                                        className="h-1.5 w-1.5 rounded-full bg-violet-400"
                                        style={{ animation: `bounce 1.2s ease-in-out ${index * 0.15}s infinite` }}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-xs text-zinc-500">Retrieving grounded evidence...</span>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-[#0e0e1a] border border-white/[0.07] rounded-2xl rounded-tl-sm px-5 py-4 space-y-3">
                                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{message.content}</p>
                                {message.citations && message.citations.length > 0 && (
                                  <div className="border-t border-white/[0.06] pt-3 space-y-1.5">
                                    <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Sources</p>
                                    {message.citations.map((citation) => (
                                      <button
                                        key={`${citation.block_id}-${citation.rank}`}
                                        onClick={() => openPage(citation.page, { blockId: citation.block_id, text: citation.text })}
                                        className="w-full text-left flex items-start gap-2.5 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-lg px-3 py-2 transition-colors"
                                      >
                                        <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 rounded px-1.5 py-0.5 flex-shrink-0">p.{citation.page}</span>
                                        <span className="text-[11px] text-zinc-500 leading-relaxed italic">{trimText(citation.text, 160)}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-white/[0.06] bg-[#0a0a0f]/95 backdrop-blur-xl p-4">
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-end gap-3 bg-[#0e0e1a] border border-white/[0.09] hover:border-white/[0.14] focus-within:border-violet-500/40 rounded-2xl px-4 py-3 transition-all duration-200 shadow-lg shadow-black/20 focus-within:shadow-violet-500/10">
                    <textarea
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendQuestion();
                        }
                      }}
                      placeholder="Ask anything about this document..."
                      rows={1}
                      className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 resize-none focus:outline-none leading-relaxed max-h-40 min-h-[24px]"
                      style={{ height: "24px" }}
                      onInput={(event) => {
                        const target = event.target as HTMLTextAreaElement;
                        target.style.height = "24px";
                        target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                      }}
                    />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="h-8 w-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all duration-200"
                        title="Upload document"
                      >
                        <UploadIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => void sendQuestion()}
                        disabled={!inputValue.trim()}
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center transition-all duration-200",
                          inputValue.trim()
                            ? "bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 text-white hover:scale-105"
                            : "bg-white/[0.05] border border-white/[0.08] text-zinc-600 cursor-not-allowed"
                        )}
                      >
                        <SendIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 px-1">
                    <p className="text-[11px] text-zinc-600">Press Enter to send · Shift+Enter for new line</p>
                    <button onClick={() => setRightPanelOpen((current) => !current)} className="text-[11px] text-violet-500 hover:text-violet-400 transition-colors font-medium">
                      {rightPanelOpen ? "Hide source panel" : "Open source panel"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        <aside className={cn("bg-[#0e0e1a] overflow-hidden flex flex-col transition-all duration-300 ease-in-out", rightPanelOpen ? "w-[42%] min-w-[360px]" : "w-0")}>
          <div className={cn("flex flex-col h-full min-w-[360px] transition-opacity duration-300", rightPanelOpen ? "opacity-100" : "opacity-0")}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0a0a0f]">
              <div className="flex items-center gap-2">
                <DocumentIcon className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-medium text-white truncate max-w-[220px]">{doc?.filename || "Document"}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-zinc-500 font-medium">Viewing page {rightPanelPage}</span>
                <button
                  onClick={() => {
                    setRightPanelOpen(false);
                    setActiveHighlightBlockId(null);
                    setActiveHighlightText(null);
                  }}
                  className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {(activeHighlightText || activeHighlightBlockId) && (
              <div className="bg-violet-500/10 border-b border-violet-500/20 px-4 py-2 text-xs text-violet-200">
                Source anchor: {activeHighlightText ? trimText(activeHighlightText, 120) : activeHighlightBlockId}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {!currentPage && (
                <div className="text-sm text-zinc-500">Loading page {rightPanelPage}...</div>
              )}

              {currentPage?.blocks?.map((block) => {
                const highlighted =
                  (activeHighlightBlockId && block.block_id === activeHighlightBlockId) ||
                  (activeHighlightText && block.text.toLowerCase().includes(activeHighlightText.toLowerCase().slice(0, 80)));
                return (
                  <div
                    key={block.block_id}
                    className={cn(
                      "rounded-2xl border px-4 py-3 transition-all duration-200",
                      highlighted
                        ? "border-violet-500/35 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                        : "border-white/[0.06] bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[10px] uppercase tracking-[0.24em] text-zinc-600">{block.block_type || "block"}</span>
                      {highlighted && <span className="text-[10px] text-violet-300">Highlighted</span>}
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{block.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/[0.06] bg-[#0a0a0f] p-3 flex items-center justify-between">
              <button
                onClick={() => openPage(Math.max(1, rightPanelPage - 1))}
                disabled={rightPanelPage <= 1}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-xs text-zinc-500">Page {rightPanelPage} of {pageCount || "?"}</span>
              <button
                onClick={() => openPage(Math.min(pageCount || rightPanelPage + 1, rightPanelPage + 1))}
                disabled={Boolean(pageCount && rightPanelPage >= pageCount)}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        </aside>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.csv,.md,.xlsx,.png,.jpg,.jpeg,.webp,.bmp,.tiff"
        className="hidden"
        onChange={handleFileChange}
      />

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

function OutlineSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</div>
        <div className="text-[11px] text-zinc-600">{count}</div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyOutline({ label }: { label: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-3 text-xs text-zinc-600">{label}</div>;
}

function MetaPill({
  icon,
  text,
  className,
  textClassName,
}: {
  icon: ReactNode;
  text: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1.5", className)}>
      {icon}
      <span className={cn("text-xs text-zinc-400", textClassName)}>{text}</span>
    </div>
  );
}

function CitationRow({
  citations,
  onOpen,
}: {
  citations: SummaryCitation[];
  onOpen: (pageNumber: number, options?: { blockId?: string | null; text?: string | null }) => void;
}) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {citations.map((citation) => (
        <button
          key={`${citation.evidence_id}-${citation.block_id}`}
          onClick={() => onOpen(citation.page, { blockId: citation.block_id, text: citation.label })}
          className="text-[11px] text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded-full px-2.5 py-1 transition-colors"
        >
          {citation.label}
        </button>
      ))}
    </div>
  );
}

function trimText(text: string, limit: number) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function iconProps(className?: string) {
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
    <svg {...iconProps(className)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </svg>
  );
}

function FigureIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M13 2L3 14h8l-1 8 11-14h-8l1-6z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
