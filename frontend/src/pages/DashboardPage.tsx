import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Incident, LiveVehicle, Notice } from "../types";

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [live, setLive] = useState<LiveVehicle[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      hasRole("admin", "control_room_operator", "depot_manager")
        ? api<LiveVehicle[]>("/api/avls/live")
        : Promise.resolve([]),
      api<Incident[]>("/api/incidents?mine_only=false"),
      api<Notice[]>("/api/notices"),
    ])
      .then(([l, i, n]) => {
        setLive(l);
        setIncidents(i.slice(0, 5));
        setNotices(n.slice(0, 3));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [hasRole]);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl text-ncrtc-navy">Operations overview</h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome, {user?.full_name}. GPS positions are simulated by a background tick script.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Live vehicles" value={String(live.length)} hint="Polled every 5s on the map" />
        <Stat
          label="Open incidents"
          value={String(incidents.filter((i) => i.status !== "closed" && i.status !== "resolved").length)}
          hint="Across visible depots"
        />
        <Stat label="Unread notices" value={String(notices.filter((n) => !n.read).length)} hint="For your role" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ncrtc-navy">Recent incidents</h2>
            <Link to="/incidents" className="text-sm text-ncrtc-teal hover:underline">
              View all
            </Link>
          </div>
          {incidents.length === 0 ? (
            <Empty message="No incidents yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {incidents.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">
                      #{i.id} · {i.type} · {i.severity}
                    </div>
                    <div className="text-slate-500 line-clamp-1">{i.description}</div>
                  </div>
                  <span className="rounded bg-ncrtc-sand px-2 py-0.5 text-xs uppercase">{i.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-ncrtc-navy">Notices</h2>
            <Link to="/notices" className="text-sm text-ncrtc-teal hover:underline">
              Open CMS
            </Link>
          </div>
          {notices.length === 0 ? (
            <Empty message="No notices." />
          ) : (
            <ul className="space-y-3">
              {notices.map((n) => (
                <li key={n.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="font-medium">{n.title}</div>
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{n.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-display text-3xl text-ncrtc-navy">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}
