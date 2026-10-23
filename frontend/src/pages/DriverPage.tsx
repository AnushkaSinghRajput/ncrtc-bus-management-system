import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Depot, Duty, Notice } from "../types";

export default function DriverPage() {
  const [duty, setDuty] = useState<Duty | null>(null);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);
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
    if (selected) {
      const updated = n.find((x) => x.id === selected.id) || null;
      setSelected(updated);
    }
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function acknowledge() {
    if (!duty) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/duties/${duty.id}/acknowledge`, { method: "POST" });
      setMsg("Duty acknowledged");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function openNotice(n: Notice) {
    setSelected(n);
    setError("");
    try {
      // Mark read only — acknowledgement is a separate explicit action
      await api(`/api/notices/${n.id}/read`, { method: "POST" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function ackNotice() {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/api/notices/${selected.id}/acknowledge`, { method: "POST" });
      setMsg("Notice acknowledged");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function panic() {
    if (!confirm("Raise a P1 PANIC incident now?")) return;
    setBusy(true);
    setError("");
    try {
      const inc = await api<{ id: number }>("/api/incidents/panic", { method: "POST" });
      setMsg(`Panic alert sent — incident #${inc.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading driver app…" />;

  const unread = notices.filter((n) => !n.read);
  const depotName = depots.find((d) => d.id === duty?.depot_id)?.name || (duty ? `Depot #${duty.depot_id}` : "—");

  return (
    <div className="mx-auto max-w-md space-y-4 animate-rise">
      <div className="rounded-2xl bg-ncrtc-navy px-5 py-6 text-white shadow-lg">
        <div className="text-xs uppercase tracking-[0.2em] text-ncrtc-gold">NCRTC Driver</div>
        <h1 className="mt-1 font-display text-3xl">Today’s duty</h1>
        <p className="mt-1 text-sm text-white/75">Phone-first PWA · GPS data on the map is simulated</p>
      </div>

      {error && <ErrorBox message={error} />}
      {msg && <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm">{msg}</div>}

      <section className="panel p-4">
        {!duty ? (
          <Empty message="No published duty for today." />
        ) : (
          <div className="space-y-2 text-sm">
            <Row label="Depot" value={depotName} />
            <Row label="Vehicle" value={duty.vehicle?.reg_no || String(duty.vehicle_id)} />
            <Row label="Route" value={duty.route ? `${duty.route.code} · ${duty.route.name}` : String(duty.route_id)} />
            <Row label="Start" value={duty.start_time.slice(0, 5)} />
            <Row label="End" value={duty.end_time.slice(0, 5)} />
            <Row label="Status" value={duty.status} />
            {duty.status === "published" && (
              <button className="btn-accent mt-3 w-full" disabled={busy} onClick={acknowledge}>
                Acknowledge duty
              </button>
            )}
            {duty.ack_at && (
              <p className="text-xs text-slate-500">Acknowledged at {new Date(duty.ack_at).toLocaleString()}</p>
            )}
          </div>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="font-semibold text-ncrtc-navy">
          Notices {unread.length > 0 && <span className="text-ncrtc-teal">({unread.length} unread)</span>}
        </h2>
        {notices.length === 0 ? (
          <Empty message="No notices." />
        ) : (
          <ul className="mt-3 space-y-2">
            {notices.map((n) => (
              <li key={n.id}>
                <button
                  className="w-full rounded-lg border border-slate-100 px-3 py-3 text-left hover:bg-ncrtc-mist"
                  onClick={() => openNotice(n)}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.read && <span className="text-xs text-ncrtc-teal">NEW</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{n.body}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <div className="mt-4 rounded-lg border border-ncrtc-sand bg-ncrtc-mist p-3">
            <h3 className="font-semibold text-ncrtc-navy">{selected.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm">{selected.body}</p>
            {selected.ack_required && !selected.acknowledged && (
              <button className="btn-accent mt-3 w-full" disabled={busy} onClick={ackNotice}>
                Confirm acknowledgement
              </button>
            )}
            {selected.acknowledged && (
              <p className="mt-2 text-xs text-ncrtc-teal">Acknowledged</p>
            )}
          </div>
        )}
      </section>

      <button className="btn-danger w-full py-4 text-base shadow-lg" disabled={busy} onClick={panic}>
        PANIC — raise P1 alert
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
