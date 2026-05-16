import { useEffect, useRef, useState } from 'react';

const TESTIMONIALS = [
  {
    quote: "I reviewed a 200-page legal contract in 8 minutes. My lawyer spent 3 days on it. Same conclusions.",
    name: "Marcus R.",
    role: "Startup Founder",
    avatar: "M",
    color: "#7c3aed",
    stars: 5,
  },
  {
    quote: "We process 400+ research papers a week. Documind cut that time by 80%. It's not an exaggeration.",
    name: "Dr. Sarah Chen",
    role: "Research Lead, BioLabs",
    avatar: "S",
    color: "#0ea5e9",
    stars: 5,
  },
  {
    quote: "Finally, I don't have to read every line of every document. I just ask what I need.",
    name: "Thomas A.",
    role: "M&A Analyst",
    avatar: "T",
    color: "#10b981",
    stars: 5,
  },
  {
    quote: "The citation feature alone is worth it. No more 'I think it said something like...' in meetings.",
    name: "Priya K.",
    role: "Operations Lead",
    avatar: "P",
    color: "#f59e0b",
    stars: 5,
  },
  {
    quote: "Documind read a scanned 1987 report and answered questions about it instantly. I was shocked.",
    name: "James W.",
    role: "Due Diligence Consultant",
    avatar: "J",
    color: "#ef4444",
    stars: 5,
  },
  {
    quote: "Our onboarding docs are now fully searchable by AI. New hires get answers in seconds, not hours.",
    name: "Emily F.",
    role: "Head of People, Verido",
    avatar: "E",
    color: "#8b5cf6",
    stars: 5,
  },
];

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

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 50% 100%, rgba(139,92,246,0.06) 0%, transparent 70%)
          `,
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/3 mb-5">
            <span className="text-xs text-white/30 font-medium tracking-widest uppercase">Real results</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight gradient-text-white mb-4">
            People are time-traveling.
          </h2>
          <p className="text-white/30 text-lg font-light">What used to take hours now takes seconds.</p>
        </div>

        {/* Stats row */}
        <div className={`grid grid-cols-3 gap-4 mb-16 transition-all duration-700 delay-200 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {[
            { value: '80%', label: 'Faster document review' },
            { value: '2.1s', label: 'Average answer time' },
            { value: '99.4%', label: 'Citation accuracy' },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5 text-center border border-white/5">
              <div className="text-3xl sm:text-4xl font-black gradient-text mb-1.5">{stat.value}</div>
              <div className="text-xs text-white/30 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Testimonials grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className={`glass glass-hover rounded-2xl p-5 transition-all duration-700 ${
                inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: t.stars }).map((_, si) => (
                  <svg key={si} className="w-3 h-3" viewBox="0 0 24 24" fill="#f59e0b">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm text-white/55 leading-relaxed mb-4 font-light">
                "{t.quote}"
              </blockquote>

              <div className="flex items-center gap-2.5 pt-3 border-t border-white/5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: t.color }}
                >
                  {t.avatar}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white/70">{t.name}</div>
                  <div className="text-xs text-white/25">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
