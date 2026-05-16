import { useEffect, useRef, useState } from 'react';

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

const CASES = [
  {
    emoji: '⚖️',
    role: 'Legal',
    headline: 'Review contracts in minutes',
    example: '"Find every clause with a liability cap over $1M."',
    color: 'from-violet-500/10',
    border: 'border-violet-500/15',
    glow: 'rgba(139,92,246,0.15)',
  },
  {
    emoji: '📊',
    role: 'Finance',
    headline: 'Interrogate reports instantly',
    example: '"What\'s the YoY change in operating margin?"',
    color: 'from-blue-500/10',
    border: 'border-blue-500/15',
    glow: 'rgba(59,130,246,0.15)',
  },
  {
    emoji: '🔬',
    role: 'Research',
    headline: 'Extract signal from noise',
    example: '"Summarize the methodology of studies 3–7."',
    color: 'from-cyan-500/10',
    border: 'border-cyan-500/15',
    glow: 'rgba(6,182,212,0.15)',
  },
  {
    emoji: '🤝',
    role: 'Due Diligence',
    headline: 'Know before you invest',
    example: '"Red flags in the cap table or governance docs?"',
    color: 'from-emerald-500/10',
    border: 'border-emerald-500/15',
    glow: 'rgba(16,185,129,0.15)',
  },
  {
    emoji: '📚',
    role: 'Education',
    headline: 'Learn anything, fast',
    example: '"Explain the key argument of chapter 5 simply."',
    color: 'from-orange-500/10',
    border: 'border-orange-500/15',
    glow: 'rgba(245,158,11,0.15)',
  },
  {
    emoji: '🏢',
    role: 'HR & Ops',
    headline: 'Onboard in hours, not weeks',
    example: '"What\'s our PTO policy for remote employees?"',
    color: 'from-pink-500/10',
    border: 'border-pink-500/15',
    glow: 'rgba(236,72,153,0.15)',
  },
];

export default function UseCases() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 50% 60% at 80% 50%, rgba(59,130,246,0.05) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/3 mb-5">
            <span className="text-xs text-white/30 font-medium tracking-widest uppercase">Use cases</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight gradient-text-white mb-4">
            Every document type.
            <br />
            Every profession.
          </h2>
          <p className="text-white/30 text-lg font-light max-w-md mx-auto">
            If it's written down, Documind can answer questions about it.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CASES.map((c, i) => (
            <div
              key={c.role}
              className={`group relative rounded-2xl border bg-gradient-to-br to-transparent p-6 transition-all duration-500 hover:scale-[1.02] cursor-default ${c.color} ${c.border} ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10"
                style={{ background: c.glow }}
              />

              <div className="text-2xl mb-3">{c.emoji}</div>
              <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-2">{c.role}</div>
              <h3 className="text-base font-semibold text-white/80 mb-3 tracking-tight">{c.headline}</h3>
              <div className="glass rounded-lg px-3 py-2 border border-white/5">
                <p className="text-xs text-white/35 font-mono italic">{c.example}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
