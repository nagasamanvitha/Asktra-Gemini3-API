import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asktra — Causal, Documentation-Aware Truth Protection",
  description:
    "The World's First Causal, Documentation-Aware Truth Protection Agent. Explains why the system behaves this way, what contradicts the docs, and what to fix.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0d1117] text-[#e6edf3] antialiased">
        {children}
      </body>
    </html>
  );
}
