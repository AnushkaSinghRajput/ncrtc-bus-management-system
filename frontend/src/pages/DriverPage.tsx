import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon } from "../components/ui";
import type { Depot, Duty, Notice } from "../types";

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function DriverPage() {
  const { user, logout, hasRole } = useAuth();
  const online = useOnline();
  const [duty, setDuty] = useState<Duty | null>(null);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showStops, setShowStops] = useState(false);
  const [confirmPanic, setConfirmPanic] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const [d, n, dep] = await Promise.all([
      api<Duty | null>("/api/duties/today"),
      api<Notice[]>("/api/notices"),
      api<Depot[]>("/api/depots"),
    ]);
    setDuty(d);
    setNotices(n);
    setDepots(dep);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setMsg(await fn());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const acknowledge = () =>
    run(async () => {
      await api(`/api/duties/${duty!.id}/acknowledge`, { method: "POST" });
      return "Duty acknowledged. Have a safe shift.";
    });

  async function openNotice(n: Notice) {
    setSelectedId(selectedId === n.id ? null : n.id);
    if (!n.read) {
      try {
        await api(`/api/notices/${n.id}/read`, { method: "POST" });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    }
  }

  const ackNotice = (n: Notice) =>
    run(async () => {
      await api(`/api/notices/${n.id}/acknowledge`, { method: "POST" });
      return "Notice acknowledged";
    });

  const panic = () =>
    run(async () => {
      setConfirmPanic(false);
      const inc = await api<{ id: number }>("/api/incidents/panic", { method: "POST" });
      return `Panic alert sent to the control room — incident #${inc.id}. Help is on the way.`;
    });

  if (loading) return <Loading label="Loading driver app…" />;

  const unread = notices.filter((n) => !n.read).length;
  const depotName = depots.find((d) => d.id === (duty?.depot_id ?? user?.depot_id))?.name ?? "—";
  const stops = [...(duty?.route?.stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-md pb-28">
      <header className="relative overflow-hidden rounded-3xl bg-ncrtc-navy px-5 pb-6 pt-5 text-white shadow-xl">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ncrtc-teal/40 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-ncrtc-gold">
            NCRTC · {hasRole("conductor") ? "Conductor" : "Driver"}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                online ? "bg-white/10 text-white/80" : "bg-red-500/90 text-white"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-white"}`} />
              {online ? "Online" : "Offline"}
            </span>
            <button
              onClick={logout}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
              aria-label="Log out"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>
        <h1 className="relative mt-4 font-display text-3xl leading-tight">Hello, {user?.full_name?.split(" ")[0]}</h1>
        <p className="relative mt-1 text-sm text-white/70">
          {today} · {depotName}
        </p>
      </header>

      <div className="mt-4 space-y-4 px-0.5">
        {error && <ErrorBox message={error} />}
        {msg && <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">{msg}</div>}

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's duty</h2>
            {duty && <Badge value={duty.status} />}
          </div>
          {!duty ? (
            <div className="p-5">
              <Empty message="No published duty for today. Check back after your depot manager publishes the roster." />
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="font-display text-4xl leading-none text-ncrtc-navy">{duty.route?.code ?? `R${duty.route_id}`}</div>
                  <div className="mt-1 text-sm text-slate-600">{duty.route?.name}</div>
                </div>
                <div className="shrink-0 rounded-xl bg-ncrtc-mist px-3 py-2 text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Bus</div>
                  <div className="whitespace-nowrap font-semibold text-ncrtc-navy">{duty.vehicle?.reg_no ?? duty.vehicle_id}</div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <TimeBlock label="Start" value={duty.start_time.slice(0, 5)} />
                <div className="relative h-0.5 flex-1 rounded bg-slate-200">
                  <span className="absolute -top-[3px] left-0 h-2 w-2 rounded-full bg-ncrtc-teal" />
                  <span className="absolute -top-[3px] right-0 h-2 w-2 rounded-full bg-ncrtc-navy" />
                </div>
                <TimeBlock label="End" value={duty.end_time.slice(0, 5)} align="right" />
              </div>

              {stops.length > 0 && (
                <div className="mt-5">
                  <button
                    className="flex w-full items-center justify-between text-sm font-medium text-ncrtc-teal"
                    onClick={() => setShowStops((s) => !s)}
                    aria-expanded={showStops}
                  >
                    {stops.length} stops on this route
                    <span className="text-xs">{showStops ? "Hide" : "Show"}</span>
                  </button>
                  {showStops && (
                    <ol className="mt-3 space-y-0">
                      {stops.map((s, i) => (
                        <li key={s.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={`mt-1 h-2.5 w-2.5 rounded-full ${i === 0 || i === stops.length - 1 ? "bg-ncrtc-navy" : "bg-ncrtc-teal/60"}`}
                            />
                            {i < stops.length - 1 && <span className="w-0.5 flex-1 bg-slate-200" />}
                          </div>
                          <div className="flex flex-1 justify-between pb-3 text-sm">
                            <span className="text-slate-700">{s.stop?.name ?? `Stop ${s.stop_id}`}</span>
                            <span className="tabular-nums text-xs text-slate-400">+{s.planned_offset_min}m</span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}

              {duty.status === "published" && hasRole("driver") && (
                <button className="btn-accent mt-5 h-12 w-full text-base" disabled={busy} onClick={acknowledge}>
                  Acknowledge duty
                </button>
              )}
              {duty.ack_at && (
                <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Acknowledged at {new Date(duty.ack_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notices</h2>
            {unread > 0 && <Badge tone="teal">{unread} new</Badge>}
          </div>
          {notices.length === 0 ? (
            <div className="p-5">
              <Empty message="No notices." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notices.map((n) => (
                <li key={n.id}>
                  <button className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-ncrtc-mist" onClick={() => openNotice(n)}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-ncrtc-teal"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read ? "font-medium text-slate-700" : "font-semibold text-ncrtc-navy"}`}>{n.title}</span>
                      <span className={`mt-0.5 block text-xs text-slate-500 ${selectedId === n.id ? "" : "line-clamp-1"}`}>
                        {selectedId === n.id ? null : n.body}
                      </span>
                    </span>
                    {n.ack_required && !n.acknowledged && <Badge tone="amber">Ack</Badge>}
                  </button>
                  {selectedId === n.id && (
                    <div className="-mt-2 px-10 pb-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{n.body}</p>
                      {n.ack_required && !n.acknowledged && (
                        <button className="btn-accent mt-3 h-11 w-full" disabled={busy} onClick={() => ackNotice(n)}>
                          I have read and understood
                        </button>
                      )}
                      {n.acknowledged && <p className="mt-2 text-xs font-medium text-emerald-700">Acknowledged</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link
          to="/incidents"
          className="panel flex items-center gap-3 px-5 py-4 text-sm font-medium text-ncrtc-navy transition hover:bg-white"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Icon name="alert" className="h-4 w-4" />
          </span>
          Report a non-emergency issue
          <span className="ml-auto text-slate-300">→</span>
        </Link>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-red-100 bg-white/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 text-base font-bold uppercase tracking-wide text-white shadow-[0_8px_24px_rgba(220,38,38,0.35)] transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-60"
            disabled={busy}
            onClick={() => setConfirmPanic(true)}
          >
            <Icon name="alert" className="h-5 w-5" />
            Panic · P1 alert
          </button>
        </div>
      </div>

      {confirmPanic && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ncrtc-ink/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md animate-rise rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Icon name="alert" className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl text-ncrtc-navy">Send a panic alert?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This raises a P1 incident for {duty?.vehicle?.reg_no ?? "your bus"} with your last known location and alerts the control room
              immediately.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button className="btn-ghost h-12" onClick={() => setConfirmPanic(false)}>
                Cancel
              </button>
              <button className="btn-danger h-12" onClick={panic} disabled={busy}>
                {busy ? "Sending…" : "Send alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeBlock({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-display text-2xl tabular-nums text-ncrtc-navy">{value}</div>
    </div>
  );
}
