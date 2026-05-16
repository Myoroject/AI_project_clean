'use client';

import { User, Bot, ExternalLink } from 'lucide-react';

interface Citation {
    text: string;
    page?: number;
}

interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
    onViewSource?: () => void;
}

export default function ChatMessage({
    role,
    content,
    citations = [],
    onViewSource,
}: ChatMessageProps) {
    const isUser = role === 'user';

    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* Avatar */}
            <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600/20' : 'bg-white/5'
                    }`}
            >
                {isUser ? (
                    <User className="w-4 h-4 text-blue-400" />
                ) : (
                    <Bot className="w-4 h-4 text-neutral-400" />
                )}
            </div>

            {/* Message Content */}
            <div
                className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'
                    }`}
            >
                <div
                    className={`px-4 py-3 rounded-2xl ${isUser
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-white/5 text-neutral-200 rounded-bl-md'
                        }`}
                >
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                        {content}
                    </p>
                </div>

                {/* Citations for assistant messages */}
                {!isUser && citations.length > 0 && (
                    <div className="mt-3 space-y-1.5 w-full">
                        <p className="text-xs text-neutral-500 uppercase tracking-wider font-medium">
                            Sources
                        </p>
                        <ul className="space-y-1">
                            {citations.map((citation, index) => (
                                <li
                                    key={index}
                                    className="flex items-start gap-2 text-sm text-neutral-400"
                                >
                                    <span className="text-neutral-600 mt-0.5">•</span>
                                    <span className="flex-1">
                                        {citation.text}
                                        {citation.page && (
                                            <span className="text-neutral-600 ml-1">
                                                (p. {citation.page})
                                            </span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {/* View Source Button */}
                        {onViewSource && (
                            <button
                                onClick={onViewSource}
                                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 bg-white/5 rounded-md hover:bg-white/10 hover:text-neutral-300 transition-colors"
                            >
                                <ExternalLink className="w-3 h-3" />
                                View Source
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
