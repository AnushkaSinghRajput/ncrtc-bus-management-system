import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_URL, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Depot, Incident, User, Vehicle } from "../types";

export default function IncidentsPage() {
  const { id } = useParams();
  if (id) return <IncidentDetail id={Number(id)} />;
  return <IncidentList />;
}

function IncidentList() {
  const { hasRole } = useAuth();
  const [items, setItems] = useState<Incident[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [depotId, setDepotId] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "breakdown",
    severity: "P2",
    description: "",
    vehicle_id: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (severity) qs.set("severity", severity);
    if (depotId) qs.set("depot_id", depotId);
    if (mineOnly) qs.set("mine_only", "true");
    const data = await api<Incident[]>(`/api/incidents?${qs}`);
    setItems(data);
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
    try {
      const body = new FormData();
      body.append("type", form.type);
      body.append("severity", form.severity);
      body.append("description", form.description);
      if (form.vehicle_id) body.append("vehicle_id", form.vehicle_id);
      if (photo) body.append("photo", photo);
      await api("/api/incidents", { method: "POST", body });
      setForm({ ...form, description: "" });
      setPhoto(null);
      setMsg("Incident raised");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }
  if (loading) return <Loading />;

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl text-ncrtc-navy">IMS · Incidents</h1>
        <p className="text-sm text-slate-600">Raise, filter, triage — Open → Closed with notes.</p>
      </div>
      {error && <ErrorBox message={error} />}
      {msg && <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm">{msg}</div>}

      <div className="panel flex flex-wrap gap-3 p-3">
        <select className="input max-w-[160px]" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["open", "acknowledged", "in_progress", "resolved", "closed"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input max-w-[140px]" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {["P1", "P2", "P3"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {hasRole("admin", "control_room_operator") && (
          <select className="input max-w-[200px]" value={depotId} onChange={(e) => setDepotId(e.target.value)}>
            <option value="">All depots</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          Mine only
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="panel overflow-hidden">
          {items.length === 0 ? (
            <Empty message="No incidents match filters." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((i) => (
                <li key={i.id}>
                  <Link to={`/incidents/${i.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-ncrtc-mist">
                    <div>
                      <div className="font-medium">
                        #{i.id} · {i.type} · <span className="text-red-700">{i.severity}</span>
                      </div>
                      <div className="text-sm text-slate-600 line-clamp-1">{i.description}</div>
                    </div>
                    <span className="rounded bg-ncrtc-sand px-2 py-0.5 text-xs uppercase">{i.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={raise} className="panel space-y-3 p-4 h-fit">
          <h2 className="font-semibold text-ncrtc-navy">Raise incident</h2>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
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
              required
              minLength={5}
            />
          </div>
          <div>
            <label className="label">Photo (optional)</label>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>
          <button className="btn-primary w-full">Submit</button>
          {hasRole("driver", "conductor") && (
            <p className="text-xs text-slate-500">Drivers: use the Panic button on the Driver PWA for P1 alerts.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function IncidentDetail({ id }: { id: number }) {
  const { hasRole } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [note, setNote] = useState("");
  const [toStatus, setToStatus] = useState("acknowledged");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await api<Incident>(`/api/incidents/${id}`);
    setIncident(data);
  }

  useEffect(() => {
    Promise.all([
      load(),
      hasRole("admin", "depot_manager", "control_room_operator")
        ? api<User[]>("/api/users")
        : Promise.resolve([]),
    ])
      .then(([, u]) => setUsers(u))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function transition(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/api/incidents/${id}/transition`, {
        method: "POST",
        body: JSON.stringify({
          to_status: toStatus,
          note,
          assigned_to: assignedTo ? Number(assignedTo) : null,
        }),
      });
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <Loading />;
  if (!incident) return <ErrorBox message={error || "Not found"} />;

  return (
    <div className="space-y-4 animate-rise">
      <Link to="/incidents" className="text-sm text-ncrtc-teal hover:underline">
        ← Back to list
      </Link>
      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-ncrtc-navy">
              Incident #{incident.id}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {incident.type} · {incident.severity} · {incident.vehicle?.reg_no || "No vehicle"}
            </p>
          </div>
          <span className="rounded bg-ncrtc-sand px-3 py-1 text-sm uppercase">{incident.status}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed">{incident.description}</p>
        {incident.photo_path && (
          <img
            src={`${API_URL}/uploads/${incident.photo_path}`}
            alt="Incident attachment"
            className="mt-4 max-h-64 rounded-lg border border-slate-200 object-contain"
          />
        )}
      </div>
      {error && <ErrorBox message={error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="font-semibold text-ncrtc-navy">Timeline</h2>
          <ol className="mt-3 space-y-3">
            {(incident.events || []).map((ev) => (
              <li key={ev.id} className="border-l-2 border-ncrtc-teal pl-3 text-sm">
                <div className="font-medium">
                  {ev.from_status || "—"} → {ev.to_status}
                </div>
                <div className="text-slate-600">{ev.note}</div>
                <div className="text-xs text-slate-400">
                  {ev.actor?.full_name || ev.actor_id} · {new Date(ev.ts).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </section>
        {hasRole("admin", "depot_manager", "control_room_operator") && (
          <form onSubmit={transition} className="panel space-y-3 p-4 h-fit">
            <h2 className="font-semibold text-ncrtc-navy">Update status</h2>
            <div>
              <label className="label">New status</label>
              <select className="input" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                {["acknowledged", "in_progress", "resolved", "closed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assign to</label>
              <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Keep current</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Note (required)</label>
              <textarea className="input min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} required minLength={2} />
            </div>
            <button className="btn-primary w-full">Save transition</button>
          </form>
        )}
      </div>
    </div>
  );
}
