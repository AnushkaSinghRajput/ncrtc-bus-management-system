import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toLocalDateString } from "../lib/dates";
import { NEXT_STATUSES, SLA_TARGETS, formatSpan, slaFor } from "../lib/sla";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, Notice, PageHeader, SectionTitle } from "../components/ui";
import type { Depot, Incident, User, Vehicle } from "../types";

const SEVERITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };
const ACTIVE = new Set(["open", "acknowledged", "in_progress"]);

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SlaChip({ incident, now }: { incident: Incident; now: number }) {
  const s = slaFor(incident, now);
  const tone = s.stage === "done" ? (s.breached ? "amber" : "green") : s.breached ? "red" : s.remainingMs < 15 * 60000 ? "amber" : "teal";
  return (
    <Badge tone={tone}>
      {s.breached && s.stage !== "done" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulseDot rounded-full bg-red-600" />}
      {s.label}
    </Badge>
  );
}

export default function IncidentsPage() {
  const { id } = useParams();
  if (id) return <IncidentDetail id={Number(id)} />;
  return <IncidentList />;
}

function IncidentList() {
  const { hasRole } = useAuth();
  const now = useNow();
  const [items, setItems] = useState<Incident[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [depotId, setDepotId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: "breakdown", severity: "P2", description: "", vehicle_id: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [msg, setMsg] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (severity) qs.set("severity", severity);
    if (depotId) qs.set("depot_id", depotId);
    if (mineOnly) qs.set("mine_only", "true");
    setItems(await api<Incident[]>(`/api/incidents?${qs}`));
  }

  useEffect(() => {
    Promise.all([load(), api<Vehicle[]>("/api/vehicles"), api<Depot[]>("/api/depots")])
      .then(([, v, d]) => {
        setVehicles(v);
        setDepots(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, severity, depotId, mineOnly]);

  async function raise(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("type", form.type);
      body.append("severity", form.severity);
      body.append("description", form.description);
      if (form.vehicle_id) body.append("vehicle_id", form.vehicle_id);
      if (photo) body.append("photo", photo);
      const created = await api<Incident>("/api/incidents", { method: "POST", body });
      setForm({ ...form, description: "" });
      setPhoto(null);
      setFileKey((k) => k + 1);
      setMsg(`Incident #${created.id} raised`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loading />;

  const sorted = [...items]
    .filter((i) => !breachedOnly || (ACTIVE.has(i.status) && slaFor(i, now).breached))
    .sort((a, b) => {
      const activeDiff = Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status));
      if (activeDiff) return activeDiff;
      const sev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
      if (sev) return sev;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const breachCount = items.filter((i) => ACTIVE.has(i.status) && slaFor(i, now).breached).length;
  const vehicleReg = (id: number | null) => vehicles.find((v) => v.id === id)?.reg_no;

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="IMS"
        title="Incidents"
        description="Raise, triage and close incidents. Active incidents are sorted by severity, and SLA timers flag anything overdue."
        actions={
          breachCount > 0 ? (
            <button
              className={`btn ${breachedOnly ? "bg-red-600 text-white hover:bg-red-700" : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"}`}
              onClick={() => setBreachedOnly((b) => !b)}
            >
              <Icon name="alert" className="h-4 w-4" />
              {breachCount} SLA {breachCount === 1 ? "breach" : "breaches"}
            </button>
          ) : (
            <Badge tone="green">All active incidents within SLA</Badge>
          )
        }
      />
      {error && <ErrorBox message={error} />}
      {msg && <Notice>{msg}</Notice>}

      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,200px))_1fr] lg:items-center">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {Object.keys(NEXT_STATUSES).map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity filter">
          <option value="">All severities</option>
          {["P1", "P2", "P3"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {hasRole("admin", "control_room_operator") ? (
          <select className="input" value={depotId} onChange={(e) => setDepotId(e.target.value)} aria-label="Depot filter">
            <option value="">All depots</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="hidden lg:block" />
        )}
        <div className="flex flex-wrap items-center gap-4 lg:justify-end">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="accent-ncrtc-teal" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Raised by me
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="accent-red-600" checked={breachedOnly} onChange={(e) => setBreachedOnly(e.target.checked)} />
            SLA breached only
          </label>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel overflow-hidden">
          <div className="data-head hidden grid-cols-[64px_minmax(0,1fr)_170px_130px] gap-4 px-5 py-3 md:grid">
            <span>Severity</span>
            <span>Incident</span>
            <span>SLA</span>
            <span className="text-right">Status</span>
          </div>
          {sorted.length === 0 ? (
            <div className="p-6">
              <Empty message="No incidents match the filters." />
            </div>
          ) : (
            <ul>
              {sorted.map((i) => (
                <li key={i.id} className="data-row">
                  <Link
                    to={`/incidents/${i.id}`}
                    className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[64px_minmax(0,1fr)_170px_130px]"
                  >
                    <span>
                      <Badge value={i.severity} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium capitalize text-ncrtc-navy">
                        #{i.id} · {i.type}
                        {i.vehicle_id && <span className="font-normal normal-case text-slate-400"> · {vehicleReg(i.vehicle_id) ?? `V${i.vehicle_id}`}</span>}
                      </span>
                      <span className="block truncate text-sm text-slate-500">{i.description}</span>
                    </span>
                    <span className="col-start-2 md:col-start-auto">
                      <SlaChip incident={i} now={now} />
                    </span>
                    <span className="col-start-2 md:col-start-auto md:text-right">
                      <Badge value={i.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={raise} className="panel h-fit space-y-4 p-5">
          <SectionTitle>Raise incident</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input capitalize" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {["breakdown", "accident", "complaint", "other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Severity</label>
              <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {["P1", "P2", "P3"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-1 text-xs text-slate-500">
            {form.severity} target: acknowledge within {formatSpan(SLA_TARGETS[form.severity].ackMs)}, resolve within{" "}
            {formatSpan(SLA_TARGETS[form.severity].resolveMs)}.
          </p>
          <div>
            <label className="label">Vehicle (optional)</label>
            <select className="input" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">—</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reg_no}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[100px]"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What happened, where, and who is affected?"
              required
              minLength={5}
            />
          </div>
          <div>
            <label className="label">Photo (optional)</label>
            <input
              key={fileKey}
              className="block w-full text-sm text-slate-600 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-ncrtc-sand file:px-3 file:text-sm file:font-semibold file:text-ncrtc-navy hover:file:bg-slate-200"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>
          <button className="btn-primary w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit incident"}
          </button>
          {hasRole("driver", "conductor") && (
            <p className="text-xs text-slate-500">Drivers: use the Panic button in My Duty for P1 emergencies.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function IncidentDetail({ id }: { id: number }) {
  const { hasRole } = useAuth();
  const now = useNow();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [note, setNote] = useState("");
  const [toStatus, setToStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canTriage = hasRole("admin", "depot_manager", "control_room_operator");

  async function load() {
    const data = await api<Incident>(`/api/incidents/${id}`);
    setIncident(data);
    setToStatus(NEXT_STATUSES[data.status]?.[0] ?? "");
  }

  useEffect(() => {
    Promise.all([load(), canTriage ? api<User[]>("/api/users") : Promise.resolve([])])
      .then(([, u]) => setUsers(u.filter((x) => x.role !== "driver" && x.role !== "conductor")))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function transition(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await api(`/api/incidents/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to_status: toStatus, note, assigned_to: assignedTo ? Number(assignedTo) : null }),
      });
      setNote("");
      setAssignedTo("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!incident) return <ErrorBox message={error || "Not found"} />;

  const next = NEXT_STATUSES[incident.status] ?? [];
  const sla = slaFor(incident, now);
  const raisedDay = toLocalDateString(new Date(incident.created_at));

  return (
    <div className="space-y-6 animate-rise">
      <Link to="/incidents" className="inline-flex items-center gap-1 text-sm font-medium text-ncrtc-teal hover:underline">
        ← All incidents
      </Link>

      <div className="panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={incident.severity} />
              <Badge value={incident.status} />
              <SlaChip incident={incident} now={now} />
            </div>
            <h1 className="mt-3 font-display text-3xl capitalize text-ncrtc-navy">
              {incident.type} · #{incident.id}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Raised {new Date(incident.created_at).toLocaleString()} by {incident.raiser?.full_name ?? `user ${incident.raised_by}`}
            </p>
          </div>
          {incident.vehicle_id && hasRole("admin", "depot_manager", "control_room_operator") && (
            <Link to={`/avls/history?vehicle=${incident.vehicle_id}&day=${raisedDay}`} className="btn-ghost">
              <Icon name="history" className="h-4 w-4" /> Vehicle path that day
            </Link>
          )}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-4">
          <Meta label="Vehicle" value={incident.vehicle?.reg_no ?? "—"} />
          <Meta label="Assigned to" value={incident.assignee?.full_name ?? "Unassigned"} />
          <Meta
            label="Location"
            value={incident.location_lat != null ? `${incident.location_lat.toFixed(4)}, ${incident.location_lng?.toFixed(4)}` : "—"}
          />
          <Meta label={sla.stage === "done" ? "SLA outcome" : `SLA · ${sla.stage}`} value={sla.label} />
        </dl>

        <p className="mt-5 whitespace-pre-line rounded-xl bg-ncrtc-mist p-4 text-sm leading-relaxed text-slate-700">{incident.description}</p>
        {incident.photo_path && (
          <img
            src={`${API_URL}/uploads/${incident.photo_path}`}
            alt="Incident attachment"
            className="mt-4 max-h-72 rounded-xl border border-slate-200 object-contain"
          />
        )}
      </div>

      {error && <ErrorBox message={error} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <section className="panel p-5">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="relative ml-2 space-y-5 border-l-2 border-slate-100 pl-6">
            {(incident.events || []).map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-ncrtc-teal ring-2 ring-teal-100" />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {ev.from_status && (
                    <>
                      <Badge value={ev.from_status} />
                      <span className="text-slate-300">→</span>
                    </>
                  )}
                  <Badge value={ev.to_status} />
                </div>
                {ev.note && <p className="mt-1.5 text-sm text-slate-700">{ev.note}</p>}
                <div className="mt-1 text-xs text-slate-400">
                  {ev.actor?.full_name || ev.actor_id} · {new Date(ev.ts).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {canTriage && (
          <form onSubmit={transition} className="panel h-fit space-y-4 p-5">
            <SectionTitle>Update status</SectionTitle>
            {next.length === 0 ? (
              <p className="text-sm text-slate-500">This incident is closed. No further transitions are allowed.</p>
            ) : (
              <>
                <div>
                  <label className="label">Move to</label>
                  <div className="flex flex-wrap gap-2">
                    {next.map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setToStatus(s)}
                        className={`h-9 rounded-lg px-3 text-sm font-medium capitalize ring-1 ring-inset transition ${
                          toStatus === s ? "bg-ncrtc-navy text-white ring-ncrtc-navy" : "bg-white text-slate-600 ring-slate-200 hover:ring-ncrtc-teal"
                        }`}
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Assign to</label>
                  <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                    <option value="">Keep current</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role.replace(/_/g, " ")})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Note (required)</label>
                  <textarea className="input min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} required minLength={2} />
                </div>
                <button className="btn-primary w-full" disabled={saving || !toStatus}>
                  {saving ? "Saving…" : "Save transition"}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label !mb-1">{label}</dt>
      <dd className="font-medium text-ncrtc-ink first-letter:uppercase">{value}</dd>
    </div>
  );
}
