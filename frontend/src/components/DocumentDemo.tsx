import { useState, useEffect, useRef } from 'react';

const DOCUMENT_LINES = [
  { text: 'Q3 Financial Report — Confidential', bold: true, highlight: false },
  { text: 'Revenue grew 34% YoY to $128.4M', bold: false, highlight: true },
  { text: 'Operating expenses: $89.2M (+12%)', bold: false, highlight: false },
  { text: 'EBITDA margin improved to 31.4%', bold: false, highlight: true },
  { text: 'Headcount increased to 847 employees', bold: false, highlight: false },
  { text: 'Net cash position: $42.1M', bold: false, highlight: false },
  { text: 'Customer churn rate: 2.3% monthly', bold: false, highlight: true },
  { text: 'Enterprise ARR: $94.7M (up from $68M)', bold: false, highlight: false },
];

const CONVERSATION = [
  {
    q: 'What was revenue growth this quarter?',
    a: 'Revenue grew **34% year-over-year**, reaching **$128.4M** in Q3. This outpaces last quarter\'s 28% growth rate.',
    citation: 'Page 2, Executive Summary',
    delay: 1200,
  },
  {
    q: 'Is the company profitable?',
    a: 'Yes — **EBITDA margin is 31.4%**, and the net cash position stands at **$42.1M**. Solid financial health.',
    citation: 'Page 4, P&L Statement',
    delay: 900,
  },
  {
    q: 'What\'s the biggest risk factor?',
    a: 'Monthly churn at **2.3%** is worth watching. At current ARR of $94.7M, that\'s ~$2.2M monthly revenue at risk.',
    citation: 'Page 7, Risk Analysis',
    delay: 1100,
  },
];

function TypingText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    setDisplayed('');
    idx.current = 0;
    const interval = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1));
        idx.current++;
      } else {
        clearInterval(interval);
        onDone?.();
      }
    }, 18);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-violet-300 font-semibold">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
      <span className="inline-block w-0.5 h-3.5 bg-violet-400 ml-0.5 animate-blink align-middle" />
    </span>
  );
}

function BoldText({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*([^*]+)\*\*/g).map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="text-violet-300 font-semibold">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function DocumentDemo() {
  const [step, setStep] = useState(0); // 0 = scanning, 1+ = QA steps
  const [scanning, setScanning] = useState(true);

  const [showQ, setShowQ] = useState(false);
  const [showA, setShowA] = useState(false);
  const [typingDone, setTypingDone] = useState(false);
  const [visibleAnswers, setVisibleAnswers] = useState<number[]>([]);
  const [inputVal, setInputVal] = useState('');
  const [customQA, setCustomQA] = useState<{ q: string; a: string } | null>(null);
  const [customLoading, setCustomLoading] = useState(false);

  useEffect(() => {
    // Scanning phase
    const scanTimer = setTimeout(() => {
      setScanning(false);
      setStep(1);
    }, 2500);
    return () => clearTimeout(scanTimer);
  }, []);

  useEffect(() => {
    if (step === 0) return;
    const qi = step - 1;
    if (qi >= CONVERSATION.length) return;
    setShowQ(false);
    setShowA(false);
    setTypingDone(false);
    const t1 = setTimeout(() => setShowQ(true), 300);
    const t2 = setTimeout(() => setShowA(true), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

  useEffect(() => {
    if (!typingDone) return;
    const qi = step - 1;
    if (qi >= CONVERSATION.length - 1) return;
    const delay = CONVERSATION[qi]?.delay ?? 1200;
    const t = setTimeout(() => {
      setVisibleAnswers((prev) => [...prev, qi]);
      setStep((s) => s + 1);
    }, delay + 800);
    return () => clearTimeout(t);
  }, [typingDone, step]);

  const handleCustomSubmit = () => {
    if (!inputVal.trim()) return;
    setCustomLoading(true);
    setCustomQA(null);
    setTimeout(() => {
      setCustomLoading(false);
      setCustomQA({
        q: inputVal,
        a: 'Based on the document, this relates to the **Q3 financial performance** data. The key insight is that **enterprise growth is accelerating** while operational costs remain controlled.',
      });
      setInputVal('');
    }, 1400);
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Ambient glow behind demo */}
      <div className="absolute -inset-10 bg-violet-600/10 blur-3xl rounded-full" />
      <div className="absolute -inset-6 bg-indigo-600/5 blur-2xl rounded-3xl" />

      <div className="relative glass rounded-2xl overflow-hidden border border-white/8 shadow-2xl shadow-black/60 animate-pulse-glow">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          <div className="flex-1 mx-4">
            <div className="h-5 rounded-md bg-white/5 flex items-center px-3 gap-2 max-w-xs mx-auto">
              <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
              <span className="text-xs text-white/20 font-mono">app.documind.ai/workspace</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-xs text-violet-300 font-medium">AI Active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/5">
          {/* Left: Document Panel */}
          <div className="relative p-6 min-h-[360px] overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-xs text-white/30 font-mono">Q3_Financial_Report.pdf</span>
              <span className="ml-auto text-xs text-white/20 font-mono">28 pages</span>
            </div>

            {/* Document content */}
            <div className="space-y-2 relative">
              {DOCUMENT_LINES.map((line, i) => (
                <div
                  key={i}
                  className={`text-xs font-mono leading-relaxed px-2 py-1 rounded transition-all duration-500 ${
                    line.highlight && !scanning ? 'bg-violet-500/10 border-l-2 border-violet-500/50 text-white/70' : 'text-white/20'
                  } ${line.bold ? 'font-semibold text-white/40' : ''}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {line.text}
                </div>
              ))}

              {/* Scan line */}
              {scanning && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div
                    className="absolute left-0 right-0 h-6 animate-scan"
                    style={{
                      background: 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.15) 40%, rgba(139,92,246,0.25) 50%, rgba(139,92,246,0.15) 60%, transparent 100%)',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Scanning overlay */}
            {scanning && (
              <div className="absolute bottom-4 left-6 right-6">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="animate-spin w-3 h-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full" />
                  <span className="text-xs text-violet-300/70">Analyzing document...</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full"
                    style={{ animation: 'slideRight 2.5s ease-out forwards', width: '100%' }}
                  />
                </div>
              </div>
            )}

            {!scanning && (
              <div className="absolute bottom-4 left-6">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-xs text-emerald-400">Indexed · 28 pages · 4,200 tokens</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Chat Panel */}
          <div className="flex flex-col min-h-[360px]">
            <div className="flex-1 p-6 space-y-4 overflow-hidden">
              {/* System message */}
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div className="glass rounded-xl rounded-tl-none px-3 py-2.5 max-w-[85%]">
                  <p className="text-xs text-white/50">
                    {scanning
                      ? 'Reading your document...'
                      : "Ready. I've read every page. Ask me anything — I'll find it instantly."}
                  </p>
                </div>
              </div>

              {/* Previous QA pairs */}
              {visibleAnswers.map((qi) => (
                <div key={qi} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-violet-600/20 border border-violet-500/20 rounded-xl rounded-tr-none px-3 py-2">
                      <p className="text-xs text-white/80">{CONVERSATION[qi].q}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <div className="space-y-1.5 max-w-[85%]">
                      <div className="glass rounded-xl rounded-tl-none px-3 py-2.5">
                        <p className="text-xs text-white/70"><BoldText text={CONVERSATION[qi].a} /></p>
                      </div>
                      <div className="flex items-center gap-1 px-1">
                        <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                        </svg>
                        <span className="text-xs text-white/20">{CONVERSATION[qi].citation}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Active Q */}
              {!scanning && step >= 1 && step <= CONVERSATION.length && (
                <div className="space-y-3">
                  {showQ && (
                    <div className="flex justify-end">
                      <div className="bg-violet-600/20 border border-violet-500/20 rounded-xl rounded-tr-none px-3 py-2">
                        <p className="text-xs text-white/80">{CONVERSATION[step - 1].q}</p>
                      </div>
                    </div>
                  )}
                  {showA && (
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                      </div>
                      <div className="space-y-1.5 max-w-[85%]">
                        <div className="glass rounded-xl rounded-tl-none px-3 py-2.5">
                          <p className="text-xs text-white/70">
                            <TypingText
                              text={CONVERSATION[step - 1].a}
                              onDone={() => setTypingDone(true)}
                            />
                          </p>
                        </div>
                        {typingDone && (
                          <div className="flex items-center gap-1 px-1">
                            <svg className="w-3 h-3 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                            </svg>
                            <span className="text-xs text-white/20">{CONVERSATION[step - 1].citation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Custom QA */}
              {customLoading && (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div className="glass rounded-xl rounded-tl-none px-4 py-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-violet-400"
                          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {customQA && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <div className="bg-violet-600/20 border border-violet-500/20 rounded-xl rounded-tr-none px-3 py-2">
                      <p className="text-xs text-white/80">{customQA.q}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                    <div className="glass rounded-xl rounded-tl-none px-3 py-2.5 max-w-[85%]">
                      <p className="text-xs text-white/70"><BoldText text={customQA.a} /></p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/5">
              <div className="flex items-center gap-2 glass rounded-xl px-3 py-2 focus-within:border-violet-500/30 transition-colors">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                  placeholder="Ask anything about this document..."
                  className="flex-1 bg-transparent text-xs text-white/60 placeholder:text-white/20 outline-none"
                />
                <button
                  onClick={handleCustomSubmit}
                  disabled={!inputVal.trim() || customLoading}
                  className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-xs text-white/15 mt-2">← Try typing your own question</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
