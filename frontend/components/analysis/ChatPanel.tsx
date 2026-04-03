'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import ChatMessage from './ChatMessage';

interface Citation {
    text: string;
    page?: number;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    citations?: Citation[];
}

interface ChatPanelProps {
    documentTitle: string;
    initialMessages?: Message[];
    onSendMessage?: (message: string) => void;
    onViewSource?: (messageId: string) => void;
}

export default function ChatPanel({
    documentTitle,
    initialMessages = [],
    onSendMessage,
    onViewSource,
}: ChatPanelProps) {
    // Use messages directly from props (parent manages state)
    const messages = initialMessages;
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        // Let parent handle adding the message
        onSendMessage?.(inputValue.trim());
        setInputValue('');

        // Reset textarea height
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputValue(e.target.value);
        // Auto-resize textarea
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    };

    return (
        <div className="flex flex-col h-full bg-[#121212]">
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center gap-3 px-6 py-4 border-b border-white/5 bg-[#121212]">
                <div className="p-2 rounded-lg bg-white/5">
                    <MessageSquare className="w-5 h-5 text-neutral-400" />
                </div>
                <div>
                    <h2 className="text-base font-medium text-neutral-100">
                        Document Q&A
                    </h2>
                    <p className="text-xs text-neutral-500 truncate max-w-[250px]">
                        Ask questions about {documentTitle}
                    </p>
                </div>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="p-4 rounded-full bg-white/5 mb-4">
                            <MessageSquare className="w-8 h-8 text-neutral-500" />
                        </div>
                        <h3 className="text-lg font-medium text-neutral-300 mb-2">
                            Start a Conversation
                        </h3>
                        <p className="text-sm text-neutral-500 max-w-[280px]">
                            Ask questions about the document content and get AI-powered answers with citations.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {messages.map((message) => (
                            <ChatMessage
                                key={message.id}
                                role={message.role}
                                content={message.content}
                                citations={message.citations}
                                onViewSource={
                                    message.role === 'assistant' && message.citations?.length
                                        ? () => onViewSource?.(message.id)
                                        : undefined
                                }
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Bar */}
            <div className="sticky bottom-0 px-6 py-4 border-t border-white/5 bg-[#121212]">
                <div className="flex items-end gap-3 p-3 rounded-xl bg-white/5 border border-white/5 focus-within:border-white/10 transition-colors">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question about the document..."
                        rows={1}
                        className="flex-1 resize-none bg-transparent text-[14px] text-neutral-200 placeholder:text-neutral-500 focus:outline-none leading-relaxed"
                        style={{ maxHeight: '120px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="flex-shrink-0 p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
                <p className="mt-2 text-[11px] text-neutral-600 text-center">
                    Press Enter to send, Shift + Enter for new line
                </p>
            </div>
        </div>
    );
}
