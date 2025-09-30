import { Suspense } from "react";
import SetupWizard from "./SetupWizard";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <SetupWizard />
    </Suspense>
  );
}

