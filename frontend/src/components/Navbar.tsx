import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#050508]/90 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 bg-violet-500 rounded-lg blur-md opacity-60" />
            <div className="relative w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 2h7l3 3v9H3V2z" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M10 2v3h3" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M5 7h6M5 9.5h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="11.5" cy="11.5" r="1.5" fill="#a78bfa" />
                <path d="M10.5 12.5L9 14" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            Docu<span className="text-violet-400">mind</span>
          </span>
        </div>

        {/* Center Nav */}
        <div className="hidden md:flex items-center gap-1">
          {['Product', 'Use Cases', 'Pricing', 'Docs'].map((item) => (
            <a
              key={item}
              href="#"
              className="px-4 py-2 text-sm text-white/50 hover:text-white/90 transition-colors duration-200 rounded-lg hover:bg-white/5"
            >
              {item}
            </a>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <Link to="/signin" className="hidden sm:block text-sm text-white/50 hover:text-white transition-colors duration-200">
            Sign in
          </Link>
          <Link
            to="/signin"
            className="relative group text-sm font-medium px-4 py-2 rounded-lg overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 transition-all duration-300 group-hover:opacity-90" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-indigo-500 opacity-0 group-hover:opacity-100 blur-sm transition-all duration-300" />
            <span className="relative text-white">Get early access</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
