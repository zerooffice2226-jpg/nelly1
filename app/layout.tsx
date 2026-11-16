// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NextAuthProvider } from "./providers";
import ExitConfirmation from "@/components/ExitConfirmation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "تطبيق الأوردرات",
  description: "نظام إدارة المبيعات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning={true}>
      <body className={inter.className}>
        <NextAuthProvider>
          <ExitConfirmation />
          {children}
        </NextAuthProvider>
      </body>
    </html>
  );
}