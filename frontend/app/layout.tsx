import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMHR Group Client Portal",
  description: "DMHR Group client portal and case management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
