import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miso Backoffice",
  description: "수급자 관리 흐름을 위한 백오피스 MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
