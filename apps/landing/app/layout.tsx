import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentGraph — what your agents actually do in production",
  description:
    "AgentGraph reads every span your agents emit in production — every prompt, every tool argument, every dollar — and tells you which tool they should have picked instead.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
