import { cn } from "../../utils/cn";

interface ProcessingLoaderProps {
  filename: string;
}

export default function ProcessingLoader({ filename }: ProcessingLoaderProps) {
  // Mock visual steps for the premium loader
  const steps = [
    { label: "Extracting text blocks", state: "done" },
    { label: "Building search index", state: "active" },
    { label: "Generating insights", state: "pending" },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      <div className="w-full max-w-md bg-[#0e0e1a] border border-white/[0.08] rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-violet-500/10">
        {/* Glow effect */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none" 
          style={{ background: "radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.4) 0%, transparent 60%)" }} 
        />
        
        <div className="relative z-10 flex flex-col items-center">
          {/* Spinning Orb */}
          <div className="h-16 w-16 mb-6 relative">
            <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping opacity-75 duration-1000" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 animate-spin flex items-center justify-center shadow-lg shadow-violet-500/40" style={{ animationDuration: '3s' }}>
               <div className="h-12 w-12 rounded-full bg-[#0e0e1a] flex items-center justify-center">
                 <svg className="h-5 w-5 text-violet-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                 </svg>
               </div>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-white mb-2 text-center">Preparing Document</h3>
          <p className="text-sm text-zinc-400 text-center mb-8 truncate max-w-full px-4">{filename}</p>

          {/* Steps */}
          <div className="w-full space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center h-4 w-4">
                    {step.state === "done" && (
                       <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                         <polyline points="20 6 9 17 4 12" />
                       </svg>
                    )}
                    {step.state === "active" && (
                       <>
                         <div className="absolute inset-0 rounded-full bg-violet-400/30 animate-ping" />
                         <div className="h-2 w-2 rounded-full bg-violet-400 relative z-10" />
                       </>
                    )}
                    {step.state === "pending" && (
                       <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                    )}
                  </div>
                  <span className={cn(
                    "text-sm transition-colors duration-300",
                    step.state === "done" ? "text-zinc-300" : 
                    step.state === "active" ? "text-white font-medium" : "text-zinc-600"
                  )}>
                    {step.label}
                  </span>
                </div>
                
                {step.state === "active" && (
                  <svg className="h-4 w-4 text-violet-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animationDuration: "2s" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
