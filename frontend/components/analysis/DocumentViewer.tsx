'use client';

import { FileText } from 'lucide-react';

interface DocumentViewerProps {
    title: string;
    content: string;
    currentPage?: number;
    totalPages?: number;
}

export default function DocumentViewer({
    title,
    content,
    currentPage = 1,
    totalPages = 1,
}: DocumentViewerProps) {
    return (
        <div className="flex flex-col h-full bg-[#0f0f0f]">
            {/* Sticky Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0f0f0f]">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/5">
                        <FileText className="w-5 h-5 text-neutral-400" />
                    </div>
                    <div>
                        <h1 className="text-base font-medium text-neutral-100 truncate max-w-[300px]">
                            {title}
                        </h1>
                        <p className="text-xs text-neutral-500">Document</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 text-xs text-neutral-400">
                    <span>Page {currentPage}</span>
                    <span className="text-neutral-600">/</span>
                    <span>{totalPages}</span>
                </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <article className="prose prose-invert prose-neutral max-w-none">
                    <div className="text-[15px] leading-[1.8] text-[#e5e7eb] whitespace-pre-wrap font-normal tracking-wide">
                        {content}
                    </div>
                </article>
            </div>
        </div>
    );
}
