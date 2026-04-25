import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "CopyTraderX Licenses",
  description: "Admin UI for managing CopyTraderX-Impulse EA licenses.",
  icons: { icon: "/copytraderx-logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-mono", jetbrainsMono.variable)}>
      <body>
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
