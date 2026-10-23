import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, PageHeader, SectionTitle, StatCard } from "../components/ui";
import type { Incident, LiveVehicle, Notice, Vehicle } from "../types";

const FLEET_STATUSES = [
  { key: "active", label: "Active", bar: "bg-emerald-500" },
  { key: "idle", label: "Idle", bar: "bg-slate-400" },
  { key: "maintenance", label: "Maintenance", bar: "bg-amber-500" },
  { key: "out_of_service", label: "Out of service", bar: "bg-red-500" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const canSeeMap = hasRole("admin", "control_room_operator", "depot_manager");
  const canSchedule = hasRole("admin", "depot_manager");
  const [live, setLive] = useState<LiveVehicle[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      canSeeMap ? api<LiveVehicle[]>("/api/avls/live") : Promise.resolve([]),
      api<Vehicle[]>("/api/vehicles"),
      api<Incident[]>("/api/incidents?mine_only=false"),
      api<Notice[]>("/api/notices"),
    ])
      .then(([l, v, i, n]) => {
        setLive(l);
        setVehicles(v);
        setIncidents(i);
        setNotices(n);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canSeeMap]);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorBox message={error} />;

  const openIncidents = incidents.filter((i) => i.status !== "closed" && i.status !== "resolved");
  const p1Open = openIncidents.filter((i) => i.severity === "P1").length;
  const unread = notices.filter((n) => !n.read).length;
  const moving = live.filter((v) => v.speed_kmh > 1).length;

  return (
    <div className="space-y-8 animate-rise">
      <PageHeader
        eyebrow="Operations overview"
        title={`${greeting()}, ${user?.full_name?.split(" ")[0] ?? ""}`}
        description="A snapshot of fleet, incident and communication activity across the depots you can see."
        actions={
          <>
            {canSeeMap && (
              <Link to="/avls" className="btn-primary">
                <Icon name="map" className="h-4 w-4" /> Open live map
              </Link>
            )}
            <Link to="/incidents" className="btn-ghost">
              <Icon name="alert" className="h-4 w-4" /> Log incident
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Live vehicles"
          value={canSeeMap ? live.length : "—"}
          hint={canSeeMap ? `${moving} moving right now` : "Map access required"}
          icon={<Icon name="bus" />}
          tone="teal"
        />
        <StatCard
          label="Fleet size"
          value={vehicles.length}
          hint={`${vehicles.filter((v) => v.status === "active").length} active`}
          icon={<Icon name="shield" />}
          tone="blue"
        />
        <StatCard
          label="Open incidents"
          value={openIncidents.length}
          hint={p1Open ? `${p1Open} critical (P1)` : "No critical incidents"}
          icon={<Icon name="alert" />}
          tone={p1Open ? "red" : "amber"}
        />
        <StatCard
          label="Unread notices"
          value={unread}
          hint={`${notices.length} notices for your role`}
          icon={<Icon name="megaphone" />}
          tone="green"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-1">
          <SectionTitle>Fleet status</SectionTitle>
          {vehicles.length === 0 ? (
            <Empty message="No vehicles visible." />
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {FLEET_STATUSES.map((s) => {
                  const n = vehicles.filter((v) => v.status === s.key).length;
                  return n ? (
                    <div key={s.key} className={s.bar} style={{ width: `${(n / vehicles.length) * 100}%` }} />
                  ) : null;
                })}
              </div>
              <ul className="mt-5 space-y-3">
                {FLEET_STATUSES.map((s) => {
                  const n = vehicles.filter((v) => v.status === s.key).length;
                  return (
                    <li key={s.key} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2.5 text-slate-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.bar}`} />
                        {s.label}
                      </span>
                      <span className="font-semibold tabular-nums text-ncrtc-navy">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-100 pt-5 text-center">
            {(["P1", "P2", "P3"] as const).map((sev) => (
              <div key={sev} className="rounded-xl bg-ncrtc-mist py-3">
                <div className="font-display text-2xl text-ncrtc-navy">
                  {openIncidents.filter((i) => i.severity === sev).length}
                </div>
                <div className="mt-1">
                  <Badge value={sev} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <SectionTitle
            action={
              <Link to="/incidents" className="text-sm font-medium text-ncrtc-teal hover:underline">
                View all →
              </Link>
            }
          >
            Recent incidents
          </SectionTitle>
          {incidents.length === 0 ? (
            <Empty message="No incidents yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {incidents.slice(0, 6).map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/incidents/${i.id}`}
                    className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition hover:bg-ncrtc-mist"
                  >
                    <Badge value={i.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium capitalize text-ncrtc-navy">
                        #{i.id} · {i.type.replace(/_/g, " ")}
                      </div>
                      <div className="truncate text-sm text-slate-500">{i.description}</div>
                    </div>
                    <div className="hidden text-right text-xs text-slate-400 sm:block">
                      {new Date(i.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    <Badge value={i.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <SectionTitle
            action={
              <Link to="/notices" className="text-sm font-medium text-ncrtc-teal hover:underline">
                Open CMS →
              </Link>
            }
          >
            Latest notices
          </SectionTitle>
          {notices.length === 0 ? (
            <Empty message="No notices." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {notices.slice(0, 4).map((n) => (
                <li key={n.id} className="rounded-xl border border-slate-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-ncrtc-navy">{n.title}</div>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ncrtc-teal" title="Unread" />}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.body}</p>
                  <div className="mt-3 flex items-center gap-2">
                    {n.ack_required && <Badge tone={n.acknowledged ? "green" : "amber"}>{n.acknowledged ? "Acknowledged" : "Ack required"}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid gap-2">
            {canSeeMap && <QuickLink to="/avls/history" icon="history" label="Replay a vehicle's day" />}
            {canSchedule && <QuickLink to="/scheduling" icon="calendar" label="Build this week's roster" />}
            <QuickLink to="/incidents" icon="alert" label="Review open incidents" />
            {hasRole("admin", "depot_manager", "control_room_operator") && (
              <QuickLink to="/notices" icon="megaphone" label="Publish a notice" />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, label }: { to: string; icon: Parameters<typeof Icon>[0]["name"]; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-medium text-ncrtc-navy transition hover:border-ncrtc-teal/40 hover:bg-ncrtc-mist"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ncrtc-sand text-ncrtc-teal">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      {label}
      <span className="ml-auto text-slate-300">→</span>
    </Link>
  );
}
