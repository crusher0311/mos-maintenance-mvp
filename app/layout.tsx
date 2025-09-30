import "./globals.css";

export const metadata = { title: "MOS Maintenance MVP" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body style={{fontFamily:"ui-sans-serif, system-ui", padding:"20px"}}>{children}</body></html>
  );
}

