import type { Metadata } from "next";
import { AppProviders } from "../components/AppProviders";
import { THEME_BOOT_SCRIPT } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "DMHR Group Client Portal",
  description: "DMHR Group client portal and case management",
  icons: {
    icon: [{ url: "/logo/dmhr-mark.png", type: "image/png" }],
    apple: [{ url: "/logo/dmhr-mark.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body style={{ margin: 0 }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
