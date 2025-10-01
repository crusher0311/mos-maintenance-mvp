// app/dashboard/recommended/page.tsx
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import RecommendedClient from "./RecommendedClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RecommendedPage({
  searchParams,
}: {
  searchParams: { vin?: string; model?: string };
}) {
  const session = await requireSession();
  if (!session) {
    redirect("/login");
  }

  const vin = searchParams.vin || "";
  const selectedModel = searchParams.model || "gpt-4o";

  return (
    <RecommendedClient 
      initialVin={vin} 
      initialModel={selectedModel} 
    />
  );
}