// app/dashboard/vehicles/[vin]/plan/PlanUI.tsx
"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { Button } from "@/components/ui";
// import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
// import { ChevronDown, ChevronUp, Clipboard, Printer, Share2 } from "lucide-react";

type TriagedItem = {
  key: string;
  title: string;
  category?: string;
  intervalMiles?: number | null;
  intervalMonths?: number | null;
  last?: { miles?: number | null; date?: Date | null } | null;
  dueAtMiles?: number | null;
  dueAtDate?: Date | null;
  milesToGo?: number | null;
  daysToGo?: number | null;
  bump?: "red" | "yellow" | null;
};

function fmtMiles(m?: number | null) {
  if (m === 0) return "0";
  if (m == null) return "";
  return m.toLocaleString();
}

function Evidence({ t }: { t: TriagedItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        className="text-xs underline flex items-center gap-1"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {open ? "Hide" : "Show"} why we recommend this
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-700 space-y-1">
          <div>
            <span className="font-medium">OEM Interval:</span>{" "}
            {t.intervalMiles ? `${fmtMiles(t.intervalMiles)} mi` : "—"}
            {t.intervalMiles && t.intervalMonths ? " / " : ""}
            {t.intervalMonths ? `${t.intervalMonths} mo` : ""}
          </div>
          <div>
            <span className="font-medium">Last done (CARFAX):</span>{" "}
            {t.last?.miles != null ? `${fmtMiles(t.last.miles)} mi` : "—"}
            {t.last?.date ? ` on ${t.last.date.toLocaleDateString()}` : ""}
          </div>
          <div>
            <span className="font-medium">Next due:</span>{" "}
            {t.dueAtMiles != null ? `${fmtMiles(t.dueAtMiles)} mi` : "—"}
            {t.dueAtDate ? ` or ${t.dueAtDate.toLocaleDateString()}` : ""}
          </div>
          {t.bump && (
            <div>
              <span className="font-medium">DVI:</span>{" "}
              {t.bump === "red" ? "🔴 flagged" : "🟡 caution"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ t, severity }: { t: TriagedItem; severity: "overdue" | "soon" | "upcoming" }) {
  const lineForClipboard = useMemo(() => {
    const bits: string[] = [];
    bits.push(`${t.title}`);
    if (t.dueAtMiles != null) bits.push(`Due at ${fmtMiles(t.dueAtMiles)} mi`);
    if (t.milesToGo != null) {
      if (t.milesToGo <= 0) bits.push(`${fmtMiles(Math.abs(t.milesToGo))} mi overdue`);
      else bits.push(`~${fmtMiles(t.milesToGo)} mi remaining`);
    }
    if (t.last?.miles != null) {
      bits.push(`Last at ${fmtMiles(t.last.miles)} mi${t.last?.date ? ` (${t.last.date.toLocaleDateString()})` : ""}`);
    }
    return bits.join(" — ");
  }, [t]);

  const badgeColor =
    severity === "overdue" ? "bg-red-600" : severity === "soon" ? "bg-amber-600" : "bg-emerald-600";

  return (
    <Card className="rounded-xl border">
      <CardHeader className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{t.title}</CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-600">
              {t.category && <Badge variant="secondary">{t.category}</Badge>}
              <Badge className={`${badgeColor} text-white`}>{severity.toUpperCase()}</Badge>
              {t.bump === "red" && <Badge className="bg-red-600 text-white">DVI 🔴</Badge>}
              {t.bump === "yellow" && <Badge className="bg-amber-600 text-white">DVI 🟡</Badge>}
              {(t.intervalMiles || t.intervalMonths) && (
                <Badge variant="outline">
                  OEM: {t.intervalMiles ? `${fmtMiles(t.intervalMiles)} mi` : ""}
                  {t.intervalMiles && t.intervalMonths ? " / " : ""}
                  {t.intervalMonths ? `${t.intervalMonths} mo` : ""}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigator.clipboard.writeText(lineForClipboard)}
              title="Copy line for RO"
            >
              <Clipboard className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button variant="default" size="sm" title="Add to RO (stub)">
              + RO
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm">
        <div className="text-neutral-800">
          {t.milesToGo != null && t.milesToGo <= 0 && (
            <>Due at <strong>{fmtMiles(t.dueAtMiles!)}</strong> mi • <strong>{fmtMiles(Math.abs(t.milesToGo))}</strong> mi overdue</>
          )}
          {t.milesToGo != null && t.milesToGo > 0 && (
            <>In ~<strong>{fmtMiles(t.milesToGo)}</strong> mi</>
          )}
          {t.dueAtDate && <> • by <strong>{t.dueAtDate.toLocaleDateString()}</strong></>}
        </div>
        <Evidence t={t} />
      </CardContent>
    </Card>
  );
}

export function PlanUI({
  vin,
  currentMiles,
  mpdBlended,
  buckets,
}: {
  vin: string;
  currentMiles: number | null;
  mpdBlended: number | null;
  buckets: { overdue: TriagedItem[]; dueSoon: TriagedItem[]; upcoming: TriagedItem[] };
}) {
  const [mode, setMode] = useState<"advisor" | "client">("advisor");

  const counts = {
    o: buckets.overdue.length,
    s: buckets.dueSoon.length,
    u: buckets.upcoming.length,
  };

  return (
    <div className="space-y-6">
      {/* Sticky summary */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
          <div className="text-sm">
            <div className="font-semibold">Plan for VIN {vin}</div>
            <div className="text-neutral-600">
              {currentMiles != null && <>Current: {fmtMiles(currentMiles)} mi</>}
              {mpdBlended != null && <> • ~{mpdBlended.toFixed(1)} mi/day</>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <Badge className="bg-red-600 text-white">Overdue {counts.o}</Badge>
              <Badge className="bg-amber-600 text-white">Due Soon {counts.s}</Badge>
              <Badge className="bg-emerald-600 text-white">Upcoming {counts.u}</Badge>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="secondary" size="sm" title="Share (stub)">
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
            <div className="ml-2">
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
                <TabsList>
                  <TabsTrigger value="advisor">Advisor</TabsTrigger>
                  <TabsTrigger value="client">Client</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Buckets */}
      <div className="mx-auto max-w-5xl px-6">
        <Tabs defaultValue="overdue">
          <TabsList className="mb-3">
            <TabsTrigger value="overdue">Overdue ({counts.o})</TabsTrigger>
            <TabsTrigger value="soon">Due Soon ({counts.s})</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming ({counts.u})</TabsTrigger>
          </TabsList>

          <TabsContent value="overdue" className="space-y-3">
            {buckets.overdue.length === 0 ? (
              <div className="text-sm text-neutral-500">Nothing overdue 🎉</div>
            ) : (
              buckets.overdue.map((t) => <ServiceCard key={t.key} t={t} severity="overdue" />)
            )}
          </TabsContent>

          <TabsContent value="soon" className="space-y-3">
            {buckets.dueSoon.length === 0 ? (
              <div className="text-sm text-neutral-500">Nothing due soon.</div>
            ) : (
              buckets.dueSoon.map((t) => <ServiceCard key={t.key} t={t} severity="soon" />)
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-3">
            {buckets.upcoming.length === 0 ? (
              <div className="text-sm text-neutral-500">No upcoming items.</div>
            ) : (
              buckets.upcoming.map((t) => <ServiceCard key={t.key} t={t} severity="upcoming" />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
