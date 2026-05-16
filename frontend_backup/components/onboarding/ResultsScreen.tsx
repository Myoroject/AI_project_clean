"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Send } from "lucide-react";
import { SAMPLE_DOCUMENT, getSampleAnswer } from "./sampleData";
import SoftWall from "./SoftWall";

interface ResultsScreenProps {
  onBack: () => void;
  onSignIn: () => void;
  onAnswerCountUpdate: (count: number) => void;
  docSource: "sample" | "upload" | null;
  docId: string | null;
}

export default function ResultsScreen({ onBack, onSignIn, onAnswerCountUpdate, docSource, docId }: ResultsScreenProps) {
  const [question, setQuestion] = useState("");
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string; citations: string[] }[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const reachedWall = qaHistory.length >= 3;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [qaHistory, isAnswering]);

  const handleAsk = async (text: string) => {
    if (!text.trim() || reachedWall || isAnswering) return;
    
    setQuestion("");
    setIsAnswering(true);
    
    // Simulate typing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    let result = { answer: "", citations: [] as string[] };
    
    if (docSource === "sample") {
      result = getSampleAnswer(text);
    } else {
      // For real uploads, we would hit the /ask endpoint here.
      // Currently, the PRD says we can mock or do real. 
      // If we need real, we'd fetch from FLASK_API_URL/ask.
      // For now, fallback to a generic message if it's an upload but we don't have the real hook.
      result = {
        answer: "This is a real document. In a fully wired flow, this would call the /ask endpoint. Since this is an onboarding demo, please use the Sample Document for full Q&A simulation.",
        citations: []
      };
    }
    
    setQaHistory(prev => [...prev, { q: text, a: result.answer, citations: result.citations }]);
    onAnswerCountUpdate(qaHistory.length + 1);
    setIsAnswering(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(question);
    }
  };

  return (
    <div className="min-h-screen bg-[#020308] text-[#f3f6fb] pb-40 selection:bg-[rgba(172,220,255,0.22)]">
      <div className="fixed inset-0 bg-[linear-gradient(180deg,#000000_0%,#05070c_42%,#0b0e14_100%)] z-0 pointer-events-none" />
      <div className="film-grain fixed inset-0 opacity-30 mix-blend-soft-light z-0 pointer-events-none" />
      
      {/* Top Nav */}
      <nav className="relative z-20 sticky top-0 bg-[#020308]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between p-4 px-6 mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to start
        </button>
        <button onClick={onSignIn} className="text-sm font-medium text-white/60 hover:text-white transition-colors">
          Sign In
        </button>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6">
        
        {/* Document Title Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 pb-6 border-b border-white/10"
        >
          <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
            📄 {docSource === "sample" ? SAMPLE_DOCUMENT.title : "Uploaded Document"}
          </h2>
          <p className="text-sm text-white/50">
            {docSource === "sample" ? SAMPLE_DOCUMENT.metadata : "Structure extracted successfully"}
          </p>
        </motion.div>

        {/* Summary Section */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <h3 className="text-sm font-semibold tracking-widest uppercase text-white/40 mb-6">Summary</h3>
          <div className="space-y-3">
            {SAMPLE_DOCUMENT.summary.map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 border-l-2 border-l-[#1e61cc]/50">
                <p className="text-[0.95rem] text-white/80 leading-relaxed flex-1">
                  {item.text}
                </p>
                <span className="text-xs font-mono text-white/30 shrink-0 mt-1">{item.citation}</span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Insights Section */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h3 className="text-sm font-semibold tracking-widest uppercase text-white/40 mb-6">Key Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAMPLE_DOCUMENT.insights.map((insight, idx) => (
              <div key={idx} className="p-5 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col h-full relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${insight.color.split(' ')[0]}`} />
                <span className={`inline-flex self-start text-[0.65rem] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-3 border ${insight.color}`}>
                  {insight.badge}
                </span>
                <p className="text-[0.9rem] text-white/80 leading-snug flex-1 mb-4">{insight.text}</p>
                <span className="text-[0.65rem] font-mono text-white/30 mt-auto">{insight.citation}</span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Q&A History */}
        {qaHistory.length > 0 && (
          <section className="mb-8 space-y-6">
            {qaHistory.map((qa, idx) => (
              <div key={idx} className="space-y-4">
                <div className="flex justify-end">
                  <div className="bg-[#1e61cc] text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[80%] text-[0.95rem] shadow-sm">
                    {qa.q}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white/10 text-white/90 border border-white/10 px-5 py-4 rounded-2xl rounded-tl-sm max-w-[85%] text-[0.95rem] shadow-sm leading-relaxed">
                    <p>{qa.a}</p>
                    {qa.citations.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {qa.citations.map((c, i) => (
                          <span key={i} className="text-[0.7rem] font-mono text-white/40 bg-white/5 px-2 py-1 rounded">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {isAnswering && (
          <div className="flex justify-start mb-8">
            <div className="bg-white/5 border border-white/5 px-5 py-4 rounded-2xl rounded-tl-sm text-white/50 flex items-center gap-2">
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce delay-75" />
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce delay-150" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </main>

      {/* Fixed Bottom Input Area */}
      <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-[#020308] via-[#020308]/95 to-transparent pt-12 pb-6 px-6 z-30">
        <div className="max-w-3xl mx-auto">
          {reachedWall ? (
            <SoftWall onSignIn={onSignIn} />
          ) : (
            <>
              {/* Suggested Questions */}
              {qaHistory.length === 0 && (
                <div className="flex overflow-x-auto pb-3 gap-2 scrollbar-hide mb-2">
                  {SAMPLE_DOCUMENT.suggestedQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAsk(q)}
                      className="whitespace-nowrap px-4 py-2 rounded-full border border-white/10 bg-white/5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              
              {/* Input Box */}
              <div className="relative flex items-center bg-white/5 border border-white/10 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] focus-within:border-white/20 focus-within:bg-white/10 transition-colors">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about this document…"
                  className="w-full bg-transparent border-none text-white placeholder-white/30 px-6 py-4 outline-none text-[0.95rem]"
                  disabled={isAnswering}
                />
                <button
                  onClick={() => handleAsk(question)}
                  disabled={!question.trim() || isAnswering}
                  className="absolute right-3 p-2 bg-[#1e61cc] text-white rounded-xl hover:bg-[#2571eb] disabled:opacity-50 disabled:hover:bg-[#1e61cc] transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
