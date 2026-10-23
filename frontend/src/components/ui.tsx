import type { ReactNode } from "react";

const TONES = {
  red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

export type Tone = keyof typeof TONES;

const STATUS_TONES: Record<string, Tone> = {
  // incidents
  open: "red",
  acknowledged: "amber",
  in_progress: "blue",
  resolved: "green",
  closed: "slate",
  // severity
  P1: "red",
  P2: "amber",
  P3: "slate",
  // duties
  draft: "slate",
  published: "blue",
  completed: "slate",
  cancelled: "red",
  // vehicles
  active: "green",
  idle: "slate",
  maintenance: "amber",
  out_of_service: "red",
};

export function toneFor(value: string): Tone {
  return STATUS_TONES[value] ?? "slate";
}

export function Badge({ value, tone, children }: { value?: string; tone?: Tone; children?: ReactNode }) {
  const t = tone ?? (value ? toneFor(value) : "slate");
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${TONES[t]}`}
    >
      {children ?? value?.replace(/_/g, " ")}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ncrtc-teal">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-3xl leading-tight text-ncrtc-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-3">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "teal",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="panel flex items-start gap-4 p-5">
      {icon && (
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONES[tone]}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 font-display text-3xl leading-none text-ncrtc-navy">{value}</div>
        {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-semibold text-ncrtc-navy">{children}</h2>
      {action}
    </div>
  );
}

export function Notice({ tone = "teal", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-lg px-4 py-2.5 text-sm ring-1 ring-inset ${TONES[tone]}`}>{children}</div>;
}

type IconName =
  | "dashboard"
  | "map"
  | "history"
  | "calendar"
  | "alert"
  | "megaphone"
  | "bus"
  | "users"
  | "logout"
  | "menu"
  | "close"
  | "shield"
  | "play"
  | "pause"
  | "copy";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5m4-1v5l3 2",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14",
  bus: "M6 17v2m12-2v2M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 7h16M8 14.5h.01M16 14.5h.01",
  users: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  logout: "M15 17l5-5-5-5m5 5H9m4 9H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z",
  play: "M7 5v14l11-7L7 5Z",
  pause: "M8 5v14m8-14v14",
  copy: "M8 8h11v11H8zM5 16V5h11",
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
