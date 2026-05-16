const LOGOS = [
  { name: 'Vercel', symbol: '▲' },
  { name: 'Linear', symbol: '◆' },
  { name: 'Notion', symbol: 'N' },
  { name: 'Figma', symbol: 'F' },
  { name: 'Stripe', symbol: 'S' },
  { name: 'Loom', symbol: '⬤' },
  { name: 'Retool', symbol: 'R' },
];

export default function TrustedBy() {
  return (
    <section className="relative py-20 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-xs uppercase tracking-widest text-white/20 font-medium mb-10">
          Trusted by teams at
        </p>
        <div className="relative">
          {/* Gradient masks */}
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#050508] to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#050508] to-transparent z-10" />

          <div className="flex items-center gap-12 overflow-hidden">
            <div
              className="flex items-center gap-12 animate-shimmer whitespace-nowrap"
              style={{
                background: 'none',
                animation: 'marquee 20s linear infinite',
              }}
            >
              {[...LOGOS, ...LOGOS].map((logo, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 text-white/20 hover:text-white/40 transition-colors duration-300 flex-shrink-0"
                >
                  <span className="text-lg font-bold font-mono">{logo.symbol}</span>
                  <span className="text-sm font-semibold tracking-tight">{logo.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
}
