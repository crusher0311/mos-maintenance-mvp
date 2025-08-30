// app/types/maintenance.ts
export type OeScheduleItem = {
  mileage: number;           // interval mileage (e.g., 5000, 15000)
  service_items: string[];   // raw text lines
};

export type VdbResponse = {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  maintenance: OeScheduleItem[];
};

export type HistoryEvent = {
  date: string;              // ISO date
  mileage?: number | null;   // odometer if known
  description: string;       // e.g., "Engine oil and filter changed"
  source?: string;           // "carfax" or other
};

export type NormalizedTask = {
  task: string;              // e.g., "Replace Engine Oil & Filter"
  intervalMiles: number;     // 5000 etc.
};

export type PlannedItem = NormalizedTask & {
  status:
    | "QUESTIONABLE_OVERDUE" // “?Overdue” — past due but no history at all
    | "OVERDUE"
    | "DUE_NOW"
    | "COMING_SOON"
    | "FUTURE"
    | "UNKNOWN";
  nextDueAt: number | null;    // next multiple after lastDoneAt (or current when no history)
  lastDoneAt: number | null;   // latest matching history mileage
  occurrencesExpected: number; // floor(current / interval) (lifetime reference)
  occurrencesDone: number;     // count of matching history events
  missedCount: number;         // number of cycles missed since last known service
  hasHistory: boolean;         // did we see any matching events?

  // --- UI-friendly labels (new) ---
  statusLabel: string;         // “Overdue”, “Due now”, “Coming soon”, etc.
  missedSinceLastLabel: string;// “Missed 2 since 132,000 mi” or "" if none
  nextDueLabel: string;        // “Due at 150,000 mi” or "" if unknown
};
