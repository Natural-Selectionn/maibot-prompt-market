import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./maibot-scrollbars.css";
import "./auth.css";
import "./sort.css";
import "./forum.css";
import "./admin.css";
import { ThemeProvider } from "@/components/theme";

export const metadata: Metadata = {
  title: "麦麦提示词库 · MaiBot Prompt Exchange",
  description: "MaiBot 提示词共享库。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
