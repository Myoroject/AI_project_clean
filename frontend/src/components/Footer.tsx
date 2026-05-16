export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 py-12 overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative w-7 h-7">
                <div className="absolute inset-0 bg-violet-500 rounded-lg blur-sm opacity-60" />
                <div className="relative w-7 h-7 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M3 2h7l3 3v9H3V2z" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
                    <path d="M10 2v3h3" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
                    <path d="M5 7h6M5 9.5h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <span className="text-white font-semibold text-base tracking-tight">
                Docu<span className="text-violet-400">mind</span>
              </span>
            </div>
            <p className="text-xs text-white/25 leading-relaxed max-w-[180px]">
              Document intelligence for people who think faster than they read.
            </p>
          </div>

          {/* Links */}
          {[
            {
              title: 'Product',
              links: ['Features', 'Pricing', 'Changelog', 'Roadmap'],
            },
            {
              title: 'Company',
              links: ['About', 'Blog', 'Careers', 'Press'],
            },
            {
              title: 'Legal',
              links: ['Privacy', 'Terms', 'Security', 'GDPR'],
            },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-white/25 hover:text-white/50 transition-colors duration-200">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/5 gap-4">
          <p className="text-xs text-white/20">© 2025 Documind, Inc. All rights reserved.</p>
          <div className="flex items-center gap-4">
            {['Twitter', 'GitHub', 'LinkedIn'].map((social) => (
              <a
                key={social}
                href="#"
                className="text-xs text-white/20 hover:text-white/40 transition-colors duration-200"
              >
                {social}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
