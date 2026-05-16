'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { DocumentViewer, ChatPanel } from '@/components/analysis';
import { ArrowLeft, Loader2 } from 'lucide-react';

const FLASK_API_URL = 'http://localhost:5000';

interface DocumentData {
    doc_id: string;
    text: string;
    filename: string;
    size: number;
}

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

function AnalysisContent() {
    const searchParams = useSearchParams();
    const docId = searchParams.get('doc_id');

    const [document, setDocument] = useState<DocumentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isAsking, setIsAsking] = useState(false);

    useEffect(() => {
        if (!docId) {
            setLoading(false);
            setError('No document ID provided. Please upload a document first.');
            return;
        }

        const fetchDocument = async () => {
            try {
                const response = await fetch(`${FLASK_API_URL}/api/document/${docId}`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to fetch document');
                }

                const data = await response.json();
                setDocument(data);

                // Add welcome message
                setMessages([{
                    id: 'welcome',
                    role: 'assistant',
                    content: `I've loaded "${data.filename}". Feel free to ask me any questions about the document content.`,
                    citations: [],
                }]);
            } catch (err) {
                console.error('Error fetching document:', err);
                setError(err instanceof Error ? err.message : 'Failed to load document');
            } finally {
                setLoading(false);
            }
        };

        fetchDocument();
    }, [docId]);

    const handleSendMessage = async (messageText: string) => {
        if (!docId || isAsking) return;

        // Add user message
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: messageText,
        };
        setMessages(prev => [...prev, userMessage]);
        setIsAsking(true);

        try {
            const response = await fetch(`${FLASK_API_URL}/ask`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    question: messageText,
                    doc_id: docId,
                }),
                credentials: 'include',
            });

            const data = await response.json();

            // Add assistant response
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: data.answer || 'I could not find an answer to your question.',
                citations: data.citations || [],
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            console.error('Error asking question:', err);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, there was an error processing your question. Please try again.',
                citations: [],
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsAsking(false);
        }
    };

    const handleViewSource = (messageId: string) => {
        // TODO: Implement scroll to source in document viewer
        console.log('View source for message:', messageId);
    };

    // Loading state
    if (loading) {
        return (
            <main className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-neutral-400 text-sm">Loading document...</p>
                </div>
            </main>
        );
    }

    // Error state
    if (error || !document) {
        return (
            <main className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
                <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
                    <div className="p-4 rounded-full bg-red-500/10">
                        <ArrowLeft className="w-8 h-8 text-red-400" />
                    </div>
                    <h1 className="text-xl font-medium text-neutral-100">
                        {error || 'Document not found'}
                    </h1>
                    <p className="text-neutral-500 text-sm">
                        The document may have expired or was not found.
                    </p>
                    <Link
                        href="/dashboard"
                        className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
                    >
                        Go to dashboard
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="flex h-screen w-screen overflow-hidden">
            {/* Left Panel - Document Viewer */}
            <div className="w-1/2 h-full border-r border-white/[0.06]">
                <DocumentViewer
                    title={document.filename}
                    content={document.text}
                    currentPage={1}
                    totalPages={1}
                />
            </div>

            {/* Right Panel - Chat Interface */}
            <div className="w-1/2 h-full">
                <ChatPanel
                    documentTitle={document.filename}
                    initialMessages={messages}
                    onSendMessage={handleSendMessage}
                    onViewSource={handleViewSource}
                />
            </div>
        </main>
    );
}

export default function AnalysisPage() {
    return (
        <Suspense fallback={
            <main className="flex h-screen w-screen items-center justify-center bg-[#0f0f0f]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    <p className="text-neutral-400 text-sm">Loading...</p>
                </div>
            </main>
        }>
            <AnalysisContent />
        </Suspense>
    );
}
