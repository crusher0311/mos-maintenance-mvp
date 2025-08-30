// /app/layout.tsx
import "./globals.css";
import React from "react";

export const metadata = {
  title: "MOS Maintenance MVP",
  description: "Maintenance analysis demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
