import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Westpac AI Agent Service",
  description: "Control what your AI agent can spend",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-brand="wbc" className="h-full antialiased">
      <body suppressHydrationWarning className="min-h-full bg-gray-100">{children}</body>
    </html>
  );
}
