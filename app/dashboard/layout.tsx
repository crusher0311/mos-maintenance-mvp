import type { ReactNode } from "react";
import DashboardHeader from "./Header";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardHeader />
      <div className="mx-auto max-w-5xl p-6">{children}</div>
    </>
  );
}
