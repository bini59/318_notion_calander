import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Notion → iCal 브릿지",
  description:
    "Notion 데이터베이스를 표준 iCal(.ics) 구독 피드로 노출합니다. 읽기 전용, Notion이 원본입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={inter.variable}>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
