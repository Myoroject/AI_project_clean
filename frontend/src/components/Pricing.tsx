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

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    desc: 'For curious minds. No credit card.',
    features: ['5 documents / month', '20 questions / document', 'PDF & DOCX support', 'Community support'],
    cta: 'Start free',
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro',
    price: '$29',
    period: 'per month',
    desc: 'For individuals who move fast.',
    features: [
      'Unlimited documents',
      'Unlimited questions',
      'All file formats',
      'Citation export',
      'Priority processing',
      'Email support',
    ],
    cta: 'Start 14-day trial',
    highlight: true,
    badge: 'Most popular',
  },
  {
    name: 'Team',
    price: '$99',
    period: 'per month',
    desc: 'For teams that run on documents.',
    features: [
      'Everything in Pro',
      'Up to 10 users',
      'Shared workspaces',
      'Admin controls',
      'API access',
      'Slack & Notion sync',
      'Dedicated support',
    ],
    cta: 'Start team trial',
    highlight: false,
    badge: null,
  },
];

export default function Pricing() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className="relative py-28 overflow-hidden" id="pricing">
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(99,102,241,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-6xl mx-auto px-6">
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/8 bg-white/3 mb-5">
            <span className="text-xs text-white/30 font-medium tracking-widest uppercase">Pricing</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight gradient-text-white mb-4">
            Simple. Honest. Fast.
          </h2>
          <p className="text-white/30 text-lg font-light">Start free. Upgrade when you're ready.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {PLANS.map((plan, i) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 flex flex-col transition-all duration-700 ${
                plan.highlight
                  ? 'border border-violet-500/40 bg-gradient-to-b from-violet-500/10 to-transparent shadow-xl shadow-violet-500/10'
                  : 'glass border border-white/6'
              } ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="px-3 py-1 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-xs text-white font-semibold">
                    {plan.badge}
                  </div>
                </div>
              )}

              {plan.highlight && (
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                  <div
                    className="absolute inset-[-1px] rounded-2xl"
                    style={{
                      background: 'linear-gradient(135deg, rgba(139,92,246,0.4), rgba(99,102,241,0.2), transparent 50%)',
                      padding: '1px',
                    }}
                  />
                </div>
              )}

              <div className="mb-6">
                <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">{plan.name}</span>
                <div className="flex items-baseline gap-1 mt-2 mb-1">
                  <span className={`text-4xl font-black ${plan.highlight ? 'gradient-text' : 'text-white/80'}`}>
                    {plan.price}
                  </span>
                  <span className="text-sm text-white/30">/{plan.period}</span>
                </div>
                <p className="text-xs text-white/30">{plan.desc}</p>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg
                      className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${plan.highlight ? 'text-violet-400' : 'text-white/30'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-white/50">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`relative w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/25'
                    : 'bg-white/5 text-white/50 hover:bg-white/8 hover:text-white/70 border border-white/8'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-white/20 mt-8">
          All plans include 256-bit encryption, SOC 2 compliance, and GDPR-ready data handling.
        </p>
      </div>
    </section>
  );
}
