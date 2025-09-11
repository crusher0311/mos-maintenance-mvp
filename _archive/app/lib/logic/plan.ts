// app/lib/logic/plan.ts
import type { HistoryEvent, NormalizedTask } from "../../types/maintenance";

export type BuiltPlanItem = {
  task: string;
  intervalMiles: number | null;
  status: "OVERDUE" | "QUESTIONABLE_OVERDUE" | "DUE_NOW" | "COMING_SOON" | "FUTURE" | "UNKNOWN";
  nextDueAt: number | null;
  lastDoneAt: number | null;
  occurrencesExpected?: number;
  occurrencesDone?: number;
  missedCount?: number;
  hasHistory?: boolean;
  statusLabel?: string;
  missedSinceLastLabel?: string;
  nextDueLabel?: string;
};

export type BuildPlanOptions = {
  horizonMileage?: number;       // how far ahead to plan (default: current + 15000 done by caller)
  soonWindowMiles?: number;      // window defining DUE_NOW vs COMING_SOON (default 5000)
  questionableIfNoHistory?: boolean; // mark as QUESTIONABLE_OVERDUE when many expected without history
};

const DEFAULT_SOON_WINDOW = 5000;

// naive phrase hints to relate history text to tasks
const HINTS: Record<string, string[]> = {
  "Replace Engine Oil & Filter": ["oil", "oil change", "engine oil", "oil & filter", "lube"],
  "Rotate Tires": ["rotate", "tire rotation"],
  "Replace Air Cleaner Element": ["air filter", "air cleaner"],
  "Inspect Brake System": ["brake inspect", "inspect brake", "brake check"],
  "Inspect/Lubricate U Joints": ["u-joint", "ujoint"],
  "Inspect Steering Components": ["steering inspect", "suspension inspect", "tie rod", "ball joint"],
  "Inspect Automatic Transmission Fluid": ["transmission", "trans fluid", "inspect trans"],
  "Replace Automatic Transmission Fluid": ["transmission fluid service", "trans fluid replace", "flush"],
  "Replace Automatic Transmission Filter": ["trans filter"],
  "Replace Spark Plugs": ["spark plug"],
  "Replace Engine Coolant": ["coolant", "antifreeze"],
  "Replace Rear Axle Fluid": ["rear differential", "rear axle", "diff service"],
  "Replace Front Axle Fluid": ["front differential", "front axle"],
  "Replace Transfer Case Fluid": ["transfer case"],
  "Replace Drive Belts": ["drive belt", "serpentine"],
  "Inspect Drive Belts": ["inspect belt"],
  "Inspect Engine Cooling System Hoses & Clamps": ["cooling system inspect", "hose clamp"],
  "Inspect Exhaust System & Heat Shields": ["exhaust inspect"],
  "Perform Multi-Point Inspection (recommended)": ["multi-point", "multipoint", "mpi"],
  "Replace Climate-Controlled Seat Filters": ["seat filter", "cabin seat filter"],
  "Repack Wheel Bearings": ["wheel bearing repack"],
  "Repack Front Wheel Bearing Grease": ["front wheel bearing repack"],
  "Inspect/Lubricate Steering Components": ["steering lube"],
};

function approxMatches(task: string, desc: string): boolean {
  const hints = HINTS[task];
  if (!hints) return false;
  const d = desc.toLowerCase();
  return hints.some(h => d.includes(h));
}

function nearestMultipleAtOrBelow(m: number, step: number): number {
  if (step <= 0) return m;
  const k = Math.floor(m / step);
  return k * step;
}

function labelStatus(s: BuiltPlanItem["status"]) {
  switch (s) {
    case "OVERDUE": return "Overdue";
    case "QUESTIONABLE_OVERDUE": return "?Overdue";
    case "DUE_NOW": return "Due now";
    case "COMING_SOON": return "Coming soon";
    case "FUTURE": return "Future";
    default: return "Unknown";
  }
}

export function buildPlan(
  tasks: NormalizedTask[],
  history: HistoryEvent[],
  currentMileage: number,
  options?: BuildPlanOptions
): BuiltPlanItem[] {
  const soonWindow = options?.soonWindowMiles ?? DEFAULT_SOON_WINDOW;
  const horizon = Math.max(currentMileage, options?.horizonMileage ?? (currentMileage + 15000));

  // For each task, compute lastDoneAt from history and the next due using interval
  const items: BuiltPlanItem[] = tasks.map(t => {
    const interval = t.intervalMiles ?? null;

    // match history by hints + nearest mileage
    let lastDoneAt: number | null = null;
    const candidates = history
      .filter(h => (h.mileage ?? null) !== null && approxMatches(t.task, h.description || ""))
      .map(h => h.mileage as number)
      .sort((a, b) => b - a); // newest first

    if (candidates.length > 0) lastDoneAt = candidates[0];

    // occurrences expected/done and nextDueAt
    let occurrencesExpected = 0;
    let occurrencesDone = candidates.length;
    let nextDueAt: number | null = null;

    if (interval && interval > 0) {
      // base schedule repeats from 0 at each interval
      // expected up to horizon:
      occurrencesExpected = Math.floor(horizon / interval);

      // compute next due: if we have a lastDoneAt, add interval; else nearest grid â‰¥ current
      if (lastDoneAt !== null) {
        const n = lastDoneAt + interval;
        nextDueAt = n;
      } else {
        const grid = nearestMultipleAtOrBelow(currentMileage, interval);
        nextDueAt = grid < currentMileage ? grid + interval : grid;
      }
    } else {
      // no mileage-based interval: leave in UNKNOWN unless AI or time-based logic later
      nextDueAt = null;
    }

    // missed count since lastDoneAt (rough)
    let missedCount = 0;
    if (interval && interval > 0) {
      const start = lastDoneAt ?? 0;
      const expectedSinceStart = Math.max(0, Math.floor((currentMileage - start) / interval));
      missedCount = Math.max(0, expectedSinceStart - (lastDoneAt !== null ? 1 : 0));
    }

    // status
    let status: BuiltPlanItem["status"] = "UNKNOWN";
    if (interval && nextDueAt !== null) {
      if (nextDueAt < currentMileage) {
        status = "OVERDUE";
      } else if (nextDueAt <= currentMileage + soonWindow) {
        status = "DUE_NOW";
      } else if (nextDueAt <= horizon) {
        status = "COMING_SOON";
      } else {
        status = "FUTURE";
      }
    } else {
      status = "UNKNOWN";
    }

    // Optional ?Overdue when we have zero history but we would expect many occurrences by now
    if (options?.questionableIfNoHistory && occurrencesDone === 0 && occurrencesExpected > 0) {
      // only mark as QUESTIONABLE_OVERDUE if next due is already behind
      if (interval && nextDueAt !== null && nextDueAt < currentMileage) {
        status = "QUESTIONABLE_OVERDUE";
      }
    }

    const item: BuiltPlanItem = {
      task: t.task,
      intervalMiles: interval,
      status,
      nextDueAt,
      lastDoneAt,
      occurrencesExpected,
      occurrencesDone,
      missedCount,
      hasHistory: occurrencesDone > 0,
    };

    // cosmetic labels for UI
    item.statusLabel = labelStatus(item.status);
    item.missedSinceLastLabel =
      item.lastDoneAt !== null && item.missedCount && item.missedCount > 0
        ? `Missed ${item.missedCount} since ${item.lastDoneAt.toLocaleString()} mi`
        : "";
    item.nextDueLabel =
      item.nextDueAt !== null ? `Due at ${item.nextDueAt.toLocaleString()} mi` : "";

    return item;
  });

  return items;
}

