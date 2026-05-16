import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocMind Oracle",
  description: "A private document oracle for high-trust analysis and bank-grade discretion.",
  keywords: ["AI", "document oracle", "BFSI", "privacy", "document intelligence", "analysis"],
  authors: [{ name: "DocMind" }],
  openGraph: {
    title: "DocMind Oracle",
    description: "Private answers drawn from your documents with bank-grade discretion.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0e14" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
