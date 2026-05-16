import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "../utils/cn";

type DashboardStatsResponse = {
  ok: true;
  stats: {
    documents: number;
    questions_asked: number;
    pages_processed: number;
    time_saved_display: string;
  };
  trends: {
    documents_this_week: number;
    questions_this_week: number;
    pages_this_week: number;
    time_saved_this_week: string;
  };
};

type AuthMeResponse = {
  ok: true;
  email: string;
  auth_provider: string;
};

type DashboardData = DashboardStatsResponse["stats"] & DashboardStatsResponse["trends"];

type RecentDoc = {
  id: number;
  name: string;
  pages: number;
  size: string;
  date: string;
  status: string;
  color: string;
  icon: ReactNode;
};

const RECENT_DOCS: RecentDoc[] = [
  {
    id: 1,
    name: "Financial Report Q3 2024.pdf",
    pages: 42,
    size: "3.2 MB",
    date: "2 hours ago",
    status: "Analyzed",
    color: "from-red-500/20 to-orange-500/20 border-red-500/20",
    icon: <DocumentIcon className="h-5 w-5 text-red-200" />,
  },
  {
    id: 2,
    name: "Product Roadmap H1 2025.docx",
    pages: 18,
    size: "1.1 MB",
    date: "Yesterday",
    status: "Analyzed",
    color: "from-blue-500/20 to-cyan-500/20 border-blue-500/20",
    icon: <ClipboardIcon className="h-5 w-5 text-cyan-200" />,
  },
  {
    id: 3,
    name: "Legal Contract - Series B.pdf",
    pages: 67,
    size: "5.8 MB",
    date: "3 days ago",
    status: "Analyzed",
    color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/20",
    icon: <ScaleIcon className="h-5 w-5 text-emerald-200" />,
  },
  {
    id: 4,
    name: "Market Research Report.pdf",
    pages: 31,
    size: "2.4 MB",
    date: "1 week ago",
    status: "Analyzed",
    color: "from-violet-500/20 to-indigo-500/20 border-violet-500/20",
    icon: <ChartIcon className="h-5 w-5 text-violet-200" />,
  },
];

const EMPTY_DASHBOARD_DATA: DashboardData = {
  documents: 0,
  questions_asked: 0,
  pages_processed: 0,
  time_saved_display: "0h",
  documents_this_week: 0,
  questions_this_week: 0,
  pages_this_week: 0,
  time_saved_this_week: "0h",
};

type StatCardDefinition = {
  key: string;
  label: string;
  icon: ReactNode;
  value: (data: DashboardData) => string;
  trend: (data: DashboardData) => string;
};

const STAT_CARDS: StatCardDefinition[] = [
  {
    key: "documents",
    label: "Documents",
    icon: <FolderIcon className="h-5 w-5 text-violet-200" />,
    value: (data) => formatNumber(data.documents),
    trend: (data) => `+${formatNumber(data.documents_this_week)} this week`,
  },
  {
    key: "questions",
    label: "Questions asked",
    icon: <ChatIcon className="h-5 w-5 text-cyan-200" />,
    value: (data) => formatNumber(data.questions_asked),
    trend: (data) => `+${formatNumber(data.questions_this_week)} this week`,
  },
  {
    key: "pages",
    label: "Pages processed",
    icon: <DocumentIcon className="h-5 w-5 text-emerald-200" />,
    value: (data) => formatNumber(data.pages_processed),
    trend: (data) => `+${formatNumber(data.pages_this_week)} pages this week`,
  },
  {
    key: "time-saved",
    label: "Time saved",
    icon: <BoltIcon className="h-5 w-5 text-amber-200" />,
    value: (data) => data.time_saved_display,
    trend: (data) => `${data.time_saved_this_week} this week`,
  },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [uploadHover, setUploadHover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [dashboardData, setDashboardData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const [authRes, statsRes] = await Promise.all([
          fetch("/api/auth/me", {
            credentials: "same-origin",
            signal: controller.signal,
          }),
          fetch("/api/dashboard/stats", {
            credentials: "same-origin",
            signal: controller.signal,
          }),
        ]);

        if (authRes.status === 401 || statsRes.status === 401) {
          navigate("/signin", { replace: true });
          return;
        }

        const authPayload = await authRes.json();
        const statsPayload = await statsRes.json();

        if (!authRes.ok) {
          throw new Error(authPayload.error || "Unable to load your session.");
        }
        if (!statsRes.ok) {
          throw new Error(statsPayload.error || "Unable to load dashboard stats.");
        }

        const authData = authPayload as AuthMeResponse;
        const statsData = statsPayload as DashboardStatsResponse;

        setUserEmail(authData.email);
        setDashboardData({
          ...statsData.stats,
          ...statsData.trends,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load dashboard stats.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, [navigate]);

  const greetingName = getGreetingName(userEmail);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex min-h-screen">
        <aside className="hidden lg:flex flex-col w-60 border-r border-white/[0.06] bg-[#0c0c14] py-5">
          <div className="px-5 mb-8">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 group">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <DocumentIcon className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-white font-semibold text-base tracking-tight">
                Docu<span className="text-violet-400">mind</span>
              </span>
            </button>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {[
              { icon: <GridIcon className="h-4 w-4" />, label: "Dashboard", active: true, path: "/dashboard" },
              { icon: <FolderIcon className="h-4 w-4" />, label: "Documents", active: false, path: "/documents" },
              { icon: <ChatIcon className="h-4 w-4" />, label: "Conversations", active: false, path: "/conversations" },
              { icon: <SearchIcon className="h-4 w-4" />, label: "Search", active: false, path: "/search" },
              { icon: <SettingsIcon className="h-4 w-4" />, label: "Settings", active: false, path: "/settings" },
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

          <div className="px-3 pt-4 border-t border-white/[0.06] mt-4">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors duration-200">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                {getInitials(userEmail)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{greetingName}</p>
                <p className="text-xs text-zinc-500 truncate">{userEmail || "Loading..."}</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-30">
            <div>
              <h1 className="text-xl font-bold text-white">Welcome back, {greetingName}</h1>
              <p className="text-sm text-zinc-500 mt-0.5">Here&apos;s what&apos;s happening with your documents.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/try")}
                className="flex items-center gap-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/20"
              >
                <UploadIcon className="h-4 w-4" />
                Upload document
              </button>
            </div>
          </div>

          <div className="p-8 max-w-6xl">
            {error ? (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <AlertIcon className="h-5 w-5 flex-shrink-0 text-red-300" />
                <div>
                  <p className="font-medium">Dashboard stats could not be loaded.</p>
                  <p className="text-red-200/80">{error}</p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {STAT_CARDS.map((card) => (
                <div
                  key={card.key}
                  className="bg-[#0e0e1a] border border-white/[0.07] rounded-2xl p-5 hover:border-white/[0.12] transition-all duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span>{card.icon}</span>
                    <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1" />
                  </div>
                  <div className="text-2xl font-bold text-white mb-0.5">
                    {loading ? <div className="h-8 w-20 rounded bg-white/[0.06] animate-pulse" /> : card.value(dashboardData)}
                  </div>
                  <div className="text-xs text-zinc-500">{card.label}</div>
                  <div className="text-[11px] text-emerald-400 mt-1 font-medium">
                    {loading ? <div className="h-3 w-24 rounded bg-white/[0.05] animate-pulse mt-1" /> : card.trend(dashboardData)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white">Recent documents</h2>
                <button
                  onClick={() => navigate("/documents")}
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  View all -&gt;
                </button>
              </div>
              <div className="space-y-3">
                {RECENT_DOCS.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => navigate("/try")}
                    className="flex items-center gap-4 bg-[#0e0e1a] border border-white/[0.07] hover:border-violet-500/25 rounded-2xl p-4 cursor-pointer group transition-all duration-200 hover:bg-white/[0.03]"
                  >
                    <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br border flex items-center justify-center flex-shrink-0", doc.color)}>
                      {doc.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-violet-200 transition-colors">{doc.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {doc.pages} pages · {doc.size} · {doc.date}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
                        <CheckIcon className="h-3 w-3" />
                        {doc.status}
                      </span>
                      <ArrowRightIcon className="h-4 w-4 text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all duration-200" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              onMouseEnter={() => setUploadHover(true)}
              onMouseLeave={() => setUploadHover(false)}
              onClick={() => navigate("/try")}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 overflow-hidden",
                uploadHover ? "border-violet-500/40 bg-violet-500/5" : "border-white/[0.08] hover:border-white/15"
              )}
            >
              <div
                className={cn("absolute inset-0 transition-opacity duration-300 pointer-events-none", uploadHover ? "opacity-100" : "opacity-0")}
                style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(109,40,217,0.08) 0%, transparent 70%)" }}
              />
              <div className="relative z-10">
                <div
                  className={cn(
                    "h-12 w-12 rounded-xl mx-auto mb-4 flex items-center justify-center transition-all duration-300",
                    uploadHover ? "bg-violet-500/20 border border-violet-500/30 scale-110" : "bg-white/[0.05] border border-white/[0.09]"
                  )}
                >
                  <UploadIcon className={cn("h-6 w-6 transition-colors duration-300", uploadHover ? "text-violet-400" : "text-zinc-500")} />
                </div>
                <p className={cn("text-sm font-medium mb-1 transition-colors duration-300", uploadHover ? "text-violet-300" : "text-zinc-400")}>
                  Drop files here or click to upload
                </p>
                <p className="text-xs text-zinc-600">PDF, DOCX, CSV, XLSX, TXT up to 50MB</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function getGreetingName(email: string): string {
  if (!email) {
    return "there";
  }

  const localPart = email.split("@")[0] || "";
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return words.join(" ") || "there";
}

function getInitials(email: string): string {
  const name = getGreetingName(email);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return initials || "DM";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

function ScaleIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M5 7h14" />
      <path d="m7 7-3 5a3 3 0 0 0 6 0L7 7Z" />
      <path d="m17 7-3 5a3 3 0 0 0 6 0l-3-5Z" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.22.74.6 1 .34.22.73.34 1.13.34H21a2 2 0 1 1 0 4h-.09c-.4 0-.79.12-1.13.34-.38.26-.6.62-.6 1.02Z" />
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
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

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
