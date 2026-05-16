import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DocumentDemo from './DocumentDemo';

const BADGE_TEXT = 'Now in public beta · 12,000+ documents processed today';

export default function Hero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[#050508]" />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial gradient overlay — center glow */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 10%, rgba(139,92,246,0.18) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 80%, rgba(59,130,246,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 20% 70%, rgba(34,211,238,0.08) 0%, transparent 60%)
          `,
        }}
      />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-[0.07] blur-3xl bg-violet-500 animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-[0.06] blur-3xl bg-blue-500 animate-float" style={{ animationDelay: '3s' }} />

      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-6xl mx-auto w-full">


        {/* Headline */}
        <div
          className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '100ms' }}
        >
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[80px] font-black leading-[1.02] tracking-tight mb-6">
            <span className="gradient-text-white">Your documents,</span>
            <br />
            <span className="gradient-text">finally understood.</span>
          </h1>
        </div>

        {/* Sub-headline */}
        <div
          className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '200ms' }}
        >
          <p className="text-lg sm:text-xl text-white/40 max-w-xl mx-auto mb-10 font-light leading-relaxed">
            Drop any document. Ask anything.
            <br />
            Get answers — not summaries.
          </p>
        </div>

        {/* CTA row */}
        <div
          className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          style={{ transitionDelay: '300ms' }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link to="/try" className="relative group px-8 py-3.5 rounded-xl overflow-hidden text-sm font-semibold">
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-violet-500 to-indigo-600" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />
              <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
              <span className="relative text-white flex items-center justify-center gap-2">
                Try it free — no signup needed
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </span>
            </Link>
          </div>
          <p className="text-xs text-white/20">No credit card · Works with PDF, Word, Excel, and more</p>
        </div>

        {/* Hero Demo */}
        <div
          className={`transition-all duration-1000 w-full mt-16 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
          style={{ transitionDelay: '500ms' }}
        >
          <DocumentDemo />
        </div>
      </div>
    </section>
  );
}
