'use client';
// components/AnalyzerResults.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

type SourceRef = { type: "DVI" | "CARFAX" | "OE"; id_or_ref: string; note?: string };
type Recommendation = {
  normalized_service: string;
  label: string;
  urgency: "overdue" | "due_now" | "upcoming";
  due_at_miles?: number | null;
  due_by_date_iso?: string | null;
  rationale: string;
  impact_of_delay: string;
  sources: SourceRef[];
  conflicts?: Array<{ description: string; dvi?: string; carfax?: string; oe?: string; resolution: string }>;
};
type Analysis = {
  vehicle: { vin: string; year?: number; make?: string; model?: string; trim?: string };
  recommendations: Recommendation[];
  redFlags?: string[];
};

const order = { overdue: 0, due_now: 1, upcoming: 2 } as const;
const tone: Record<keyof typeof order, string> = {
  overdue: "bg-destructive text-destructive-foreground",
  due_now: "bg-amber-500 text-white",
  upcoming: "bg-sky-500 text-white",
};

export default function AnalyzerResults({ analysis }: { analysis: Analysis }) {
  const recs = [...(analysis.recommendations || [])].sort(
    (a, b) => order[a.urgency] - order[b.urgency]
  );

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {analysis.vehicle.year ? `${analysis.vehicle.year} ` : ""}
            {analysis.vehicle.make} {analysis.vehicle.model}
            {analysis.vehicle.trim ? ` ${analysis.vehicle.trim}` : ""} Â·{" "}
            <span className="text-muted-foreground">{analysis.vehicle.vin}</span>
          </CardTitle>
          <CardDescription>
            {recs.length} recommendation{recs.length === 1 ? "" : "s"}
            {analysis.redFlags?.length ? ` Â· ${analysis.redFlags.length} data gap(s)` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recs.map((r, i) => (
          <Card key={i} className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">
                  <Badge variant="secondary" className="mr-2 capitalize">
                    {r.normalized_service.replace(/_/g, " ")}
                  </Badge>
                  {r.label}
                </CardTitle>
                <Badge className={`capitalize ${tone[r.urgency]}`}>{r.urgency.replace("_", " ")}</Badge>
              </div>
              <CardDescription className="flex flex-wrap gap-2">
                {r.due_at_miles != null && (
                  <Badge variant="outline" className="text-xs">Due @ {Math.round(r.due_at_miles!).toLocaleString()} mi</Badge>
                )}
                {r.due_by_date_iso && (
                  <Badge variant="outline" className="text-xs">By {new Date(r.due_by_date_iso).toLocaleDateString()}</Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-[13px] font-semibold mb-1">Why needed</div>
                <p className="text-sm leading-relaxed">{r.rationale}</p>
              </div>
              <div>
                <div className="text-[13px] font-semibold mb-1">Impact of delay</div>
                <p className="text-sm leading-relaxed">{r.impact_of_delay}</p>
              </div>
              <div className="space-y-2">
                <div className="text-[13px] font-semibold">Sources</div>
                <div className="flex flex-wrap gap-2">
                  {r.sources.map((s, idx) => (
                    <Badge key={idx} variant="outline" className="t

