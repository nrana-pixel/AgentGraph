import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { TweaksProvider } from "@/lib/tweaks";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentGraph — Runtime Tool Intelligence",
  description: "The runtime tool intelligence layer for AI agents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com"/>
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
          <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@300..700&display=swap" rel="stylesheet"/>
        </head>
        <body>
          <TweaksProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </TweaksProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
