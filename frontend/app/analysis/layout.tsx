import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Document Analysis — DocMind',
    description: 'Analyze and query your documents with AI-powered intelligence.',
};

export default function AnalysisLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
