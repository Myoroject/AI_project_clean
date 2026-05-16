import { useEffect, useRef, useState } from 'react';

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    tag: 'Speed',
    title: 'Answers in under 2 seconds',
    description: 'Not a loader. Not a spinner. Actual answers — before you finish reading the question.',
    color: 'violet',
    visual: <SpeedVisual />,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
    tag: 'Precision',
    title: 'Every answer has a source',
    description: 'Click any answer to see exactly where in the document it came from. No hallucinations.',
    color: 'blue',
    visual: <CitationVisual />,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    tag: 'Formats',
    title: 'Any file, any format',
    description: 'PDF, Word, Excel, PowerPoint, Notion exports, scanned images. Documind reads them all.',
    color: 'emerald',
    visual: <FormatsVisual />,
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
    tag: 'Collaboration',
    title: 'Your whole team, one brain',
    description: 'Share document workspaces. When one person asks a question, everyone learns.',
    color: 'orange',
    visual: <CollabVisual />,
  },
];

function SpeedVisual() {
  const [ms, setMs] = useState(2000);
  useEffect(() => {
    const t = setInterval(() => {
      setMs(Math.floor(Math.random() * 900) + 800);
    }, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-end gap-1.5 h-16">
      {['Others', 'Documind'].map((label, i) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <div
            className={`w-8 rounded-t transition-all duration-1000 ${i === 0 ? 'bg-white/10 h-14' : 'bg-violet-500/60 h-4'}`}
          />
          <span className="text-xs text-white/30">{i === 0 ? '12s' : `${(ms / 1000).toFixed(1)}s`}</span>
        </div>
      ))}
    </div>
  );
}

function CitationVisual() {
  return (
    <div className="space-y-1.5 w-full">
      {['Revenue grew 34% YoY', 'Net cash: $42.1M', 'Churn: 2.3%'].map((text, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-blue-400/60" />
          <span className="text-xs text-white/40 font-mono truncate">{text}</span>
          <span className="ml-auto text-xs text-blue-400/40 font-mono whitespace-nowrap">pg.{i + 2}</span>
        </div>
      ))}
    </div>
  );
}

function FormatsVisual() {
  const formats = ['PDF', 'DOCX', 'XLSX', 'PPTX', 'PNG', 'CSV'];
  return (
    <div className="flex flex-wrap gap-1.5">
      {formats.map((f) => (
        <span key={f} className="px-2 py-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-400/60 font-mono">
          {f}
        </span>
      ))}
    </div>
  );
}

function CollabVisual() {
  const avatars = ['A', 'B', 'C', 'D'];
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {avatars.map((a, i) => (
          <div
            key={a}
            className="w-7 h-7 rounded-full border-2 border-[#0a0a12] flex items-center justify-center text-xs font-bold text-white"
            style={{
              background: ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b'][i],
            }}
          >
            {a}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-xs text-orange-400/80">4 active</span>
      </div>
    </div>
  );
}

function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

const colorMap: Record<string, string> = {
  violet: 'from-violet-500/10 border-violet-500/15 hover:border-violet-500/30 hover:shadow-violet-500/10',
  blue: 'from-blue-500/10 border-blue-500/15 hover:border-blue-500/30 hover:shadow-blue-500/10',
  emerald: 'from-emerald-500/10 border-emerald-500/15 hover:border-emerald-500/30 hover:shadow-emerald-500/10',
  orange: 'from-orange-500/10 border-orange-500/15 hover:border-orange-500/30 hover:shadow-orange-500/10',
};

const iconColorMap: Record<string, string> = {
  violet: 'text-violet-400 bg-violet-500/10',
  blue: 'text-blue-400 bg-blue-500/10',
  emerald: 'text-emerald-400 bg-emerald-500/10',
  orange: 'text-orange-400 bg-orange-500/10',
};

const tagColorMap: Record<string, string> = {
  violet: 'text-violet-400/70 bg-violet-500/5 border-violet-500/15',
  blue: 'text-blue-400/70 bg-blue-500/5 border-blue-500/15',
  emerald: 'text-emerald-400/70 bg-emerald-500/5 border-emerald-500/15',
  orange: 'text-orange-400/70 bg-orange-500/5 border-orange-500/15',
};

export default function Features() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(139,92,246,0.05) 0%, transparent 70%)',
      }} />

      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/3 mb-5">
            <span className="text-xs text-white/30 font-medium tracking-widest uppercase">How it works</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight gradient-text-white mb-4">
            Built different.
          </h2>
          <p className="text-white/35 text-lg max-w-lg mx-auto font-light">
            Not a chatbot wrapper. A document intelligence engine.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.tag}
              className={`relative group rounded-2xl border bg-gradient-to-br to-transparent p-6 transition-all duration-500 hover:shadow-xl ${colorMap[f.color]} ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconColorMap[f.color]}`}>
                  {f.icon}
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${tagColorMap[f.color]}`}>
                  {f.tag}
                </span>
              </div>
              <h3 className="text-base font-semibold text-white/90 mb-2 tracking-tight">{f.title}</h3>
              <p className="text-sm text-white/35 leading-relaxed mb-5">{f.description}</p>
              <div className="mt-auto">{f.visual}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
