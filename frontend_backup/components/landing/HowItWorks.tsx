import { useEffect, useRef, useState } from 'react';

function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

const STEPS = [
  {
    num: '01',
    title: 'Drop your document',
    sub: 'PDF, Word, Excel, image — anything.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'AI reads everything',
    sub: 'Every page, table, footnote, chart.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Ask in plain English',
    sub: 'No training. No prompts. Just ask.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Get precise answers',
    sub: 'With exact citations. Always sourced.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 40% 50% at 10% 50%, rgba(59,130,246,0.07) 0%, transparent 60%)',
      }} />

      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-20 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/3 mb-5">
            <span className="text-xs text-white/30 font-medium tracking-widest uppercase">The flow</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight gradient-text-white">
            Zero to insight in 4 steps.
          </h2>
        </div>

        <div className="relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[12.5%] right-[12.5%] h-px">
            <div
              className="h-full transition-all duration-1000 bg-gradient-to-r from-violet-500/20 via-blue-500/20 to-emerald-500/20"
              style={{ width: inView ? '100%' : '0%' }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`flex flex-col items-center text-center transition-all duration-700 ${
                  inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                {/* Icon circle */}
                <div className="relative mb-6">
                  <div
                    className="absolute inset-0 rounded-full blur-xl opacity-40"
                    style={{
                      background: ['#7c3aed', '#3b82f6', '#06b6d4', '#10b981'][i],
                    }}
                  />
                  <div
                    className="relative w-24 h-24 rounded-full border border-white/8 flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.15)', 'rgba(6,182,212,0.15)', 'rgba(16,185,129,0.15)'][i]} 0%, rgba(255,255,255,0.02) 100%)`,
                    }}
                  >
                    <div style={{ color: ['#a78bfa', '#60a5fa', '#22d3ee', '#34d399'][i] }}>
                      {step.icon}
                    </div>
                  </div>
                  <div
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full border border-white/10 bg-[#0d0d14] flex items-center justify-center"
                  >
                    <span className="text-xs font-mono text-white/30">{step.num}</span>
                  </div>
                </div>

                <h3 className="text-sm font-semibold text-white/80 mb-1.5 tracking-tight">{step.title}</h3>
                <p className="text-xs text-white/30 leading-relaxed">{step.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
