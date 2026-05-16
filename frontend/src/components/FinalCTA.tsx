import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

function useInView(ref: React.RefObject<Element | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

const QUESTIONS = [
  '"What are the key risks in this contract?"',
  '"Summarize the financials on page 12."',
  '"What changed between v1 and v2?"',
  '"Is there a penalty clause? Where?"',
];

export default function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [currentQ, setCurrentQ] = useState(0);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setCurrentQ((q) => (q + 1) % QUESTIONS.length);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  };

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#050508]" />
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(139,92,246,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 20% 80%, rgba(59,130,246,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 30% 30% at 80% 20%, rgba(34,211,238,0.06) 0%, transparent 60%)
          `,
        }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.4) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        {/* Rotating question preview */}
        <div
          className={`mb-12 transition-all duration-700 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl glass border border-white/8 mb-4">
            <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            <span
              className="text-sm text-white/60 font-mono transition-all duration-500"
              key={currentQ}
            >
              {QUESTIONS[currentQ]}
            </span>
          </div>
          <div className="flex justify-center gap-1.5">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={`h-0.5 rounded-full transition-all duration-500 ${
                  i === currentQ ? 'w-6 bg-violet-400' : 'w-1.5 bg-white/15'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Headline */}
        <div
          className={`transition-all duration-700 delay-100 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <h2 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight mb-6">
            <span className="gradient-text-white">Stop reading.</span>
            <br />
            <span className="gradient-text">Start knowing.</span>
          </h2>
          <p className="text-lg text-white/35 mb-12 font-light max-w-lg mx-auto">
            Join 12,000+ professionals who've upgraded how they work with documents.
          </p>
        </div>

        {/* Email CTA */}
        <div
          className={`transition-all duration-700 delay-200 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
              <div className="relative flex-1 w-full">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 rounded-xl blur-sm" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="relative w-full px-4 py-3.5 rounded-xl glass border border-white/10 text-sm text-white placeholder:text-white/25 outline-none focus:border-violet-500/40 transition-colors"
                  required
                />
              </div>
              <Link
                to="/signin"
                className="relative group w-full sm:w-auto flex-shrink-0 px-6 py-3.5 rounded-xl overflow-hidden text-sm font-semibold text-center block"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-violet-500 to-indigo-500" />
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-300" />
                <span className="relative text-white">Get early access</span>
              </Link>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-3 px-6 py-4 glass rounded-xl border border-emerald-500/20 max-w-md mx-auto">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="text-left">
                <p className="text-sm text-white/80 font-medium">You're on the list!</p>
                <p className="text-xs text-white/30">We'll reach out within 24h.</p>
              </div>
            </div>
          )}

          <p className="text-xs text-white/20 mt-4">
            Free forever plan available · No credit card needed
          </p>
        </div>

        {/* Bottom decorative elements */}
        <div
          className={`mt-20 transition-all duration-700 delay-300 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {[
              { icon: '🔒', text: 'SOC 2 Compliant' },
              { icon: '🇪🇺', text: 'GDPR Ready' },
              { icon: '⚡', text: '99.9% Uptime' },
              { icon: '🛡️', text: 'Zero-knowledge storage' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-1.5">
                <span className="text-sm">{item.icon}</span>
                <span className="text-xs text-white/25">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
