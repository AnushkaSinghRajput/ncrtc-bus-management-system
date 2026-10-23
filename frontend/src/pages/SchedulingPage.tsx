import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { weekDateStrings } from "../lib/dates";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Depot, Duty, Route, Stop, User, Vehicle } from "../types";

export default function SchedulingPage() {
  const { hasRole } = useAuth();
  const days = useMemo(() => weekDateStrings(), []);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [driverFilter, setDriverFilter] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [form, setForm] = useState({
    date: days[Math.min(days.length - 1, 1)] || days[0],
    vehicle_id: "",
    driver_id: "",
    route_id: "",
    start_time: "06:00",
    end_time: "14:00",
  });

  const [routeForm, setRouteForm] = useState({
    code: "",
    name: "",
    depot_id: "",
    selectedStops: [] as number[],
  });

  async function refresh() {
    const [d, dr, v, r, s, dep] = await Promise.all([
      api<Duty[]>(`/api/duties?from_date=${days[0]}&to_date=${days[6]}`),
      api<User[]>("/api/users?role=driver"),
      api<Vehicle[]>("/api/vehicles"),
      api<Route[]>("/api/routes"),
      api<Stop[]>("/api/stops"),
      api<Depot[]>("/api/depots"),
    ]);
    setDuties(d);
    setDrivers(dr);
    setVehicles(v);
    setRoutes(r);
    setStops(s);
    setDepots(dep);
    if (!form.vehicle_id && v[0]) setForm((f) => ({ ...f, vehicle_id: String(v[0].id) }));
    if (!form.driver_id && dr[0]) setForm((f) => ({ ...f, driver_id: String(dr[0].id) }));
    if (!form.route_id && r[0]) setForm((f) => ({ ...f, route_id: String(r[0].id) }));
    if (!routeForm.depot_id && dep[0]) setRouteForm((f) => ({ ...f, depot_id: String(dep[0].id) }));
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const driverRows = drivers.filter((d) => {
    if (!driverFilter.trim()) return true;
    const q = driverFilter.toLowerCase();
    return d.full_name.toLowerCase().includes(q) || d.username.toLowerCase().includes(q);
  });

  async function assignDuty(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    try {
      await api("/api/duties", {
        method: "POST",
        body: JSON.stringify({
          date: form.date,
          vehicle_id: Number(form.vehicle_id),
          driver_id: Number(form.driver_id),
          route_id: Number(form.route_id),
          start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
          end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        }),
      });
      setMsg("Duty assigned (draft). Publish so the driver can see it.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function publishWeek() {
    setMsg("");
    setError("");
    try {
      const res = await api<{ message: string }>(
        `/api/duties/publish-week?from_date=${days[0]}&to_date=${days[6]}`,
        { method: "POST" },
      );
      setMsg(res.message);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function publishOne(dutyId: number) {
    setBusyId(dutyId);
    setError("");
    try {
      await api(`/api/duties/${dutyId}/publish`, { method: "POST" });
      setMsg(`Duty #${dutyId} published`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function createRoute(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    if (routeForm.selectedStops.length < 2) {
      setError("Select at least 2 stops for the route");
      return;
    }
    try {
      await api("/api/routes", {
        method: "POST",
        body: JSON.stringify({
          code: routeForm.code,
          name: routeForm.name,
          depot_id: Number(routeForm.depot_id),
          stops: routeForm.selectedStops.map((stop_id, i) => ({
            stop_id,
            sequence: i + 1,
            planned_offset_min: i * 8,
          })),
        }),
      });
      setMsg("Route created");
      setRouteForm((f) => ({ ...f, code: "", name: "", selectedStops: [] }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteRoute(routeId: number) {
    if (!confirm("Delete this route?")) return;
    setError("");
    try {
      await api(`/api/routes/${routeId}`, { method: "DELETE" });
      setMsg("Route deleted");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  function toggleStop(id: number) {
    setRouteForm((f) => {
      const has = f.selectedStops.includes(id);
      return {
        ...f,
        selectedStops: has ? f.selectedStops.filter((x) => x !== id) : [...f.selectedStops, id],
      };
    });
  }

  if (loading) return <Loading label="Loading roster…" />;

  return (
    <div className="space-y-6 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ncrtc-navy">Scheduling</h1>
          <p className="text-sm text-slate-600">Weekly roster grid · assign · publish duties to drivers.</p>
        </div>
        <button className="btn-accent" onClick={publishWeek}>
          Publish week
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      {msg && <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-900">{msg}</div>}

      <div className="panel p-3">
        <label className="label">Filter drivers</label>
        <input
          className="input max-w-md"
          value={driverFilter}
          onChange={(e) => setDriverFilter(e.target.value)}
          placeholder="Search by name or username"
        />
      </div>

      <div className="panel overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ncrtc-navy text-white">
            <tr>
              <th className="px-3 py-2">Driver</th>
              {days.map((d) => (
                <th key={d} className="px-3 py-2 font-normal">
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {driverRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <Empty message="No drivers match filter." />
                </td>
              </tr>
            ) : (
              driverRows.map((dr) => (
                <tr key={dr.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium">
                    {dr.full_name}
                    <div className="text-xs font-normal text-slate-400">{dr.username}</div>
                  </td>
                  {days.map((d) => {
                    const cell = duties.find((x) => x.driver_id === dr.id && x.date === d);
                    return (
                      <td key={d} className="px-2 py-2 align-top">
                        {cell ? (
                          <div className="rounded bg-ncrtc-sand px-2 py-1 text-xs">
                            <div className="font-semibold">{cell.vehicle?.reg_no || `V${cell.vehicle_id}`}</div>
                            <div>{cell.route?.code || `R${cell.route_id}`}</div>
                            <div className="uppercase text-slate-500">{cell.status}</div>
                            {cell.status === "draft" && (
                              <button
                                type="button"
                                className="mt-1 text-[10px] font-semibold text-ncrtc-teal underline"
                                disabled={busyId === cell.id}
                                onClick={() => publishOne(cell.id)}
                              >
                                {busyId === cell.id ? "…" : "Publish"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={assignDuty} className="panel space-y-3 p-4">
          <h2 className="font-semibold text-ncrtc-navy">Assign duty</h2>
          <Field label="Date">
            <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Driver">
            <select className="input" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} required>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.username})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select className="input" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reg_no}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Route">
            <select className="input" value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })} required>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input className="input" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
            </Field>
            <Field label="End">
              <input className="input" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
            </Field>
          </div>
          <button className="btn-primary">Save assignment</button>
        </form>

        {hasRole("admin", "depot_manager") && (
          <form onSubmit={createRoute} className="panel space-y-3 p-4">
            <h2 className="font-semibold text-ncrtc-navy">Create route</h2>
            <Field label="Code">
              <input className="input" value={routeForm.code} onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })} required minLength={2} />
            </Field>
            <Field label="Name">
              <input className="input" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} required minLength={2} />
            </Field>
            <Field label="Depot">
              <select className="input" value={routeForm.depot_id} onChange={(e) => setRouteForm({ ...routeForm, depot_id: e.target.value })} required>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Stops (tap to order · ${routeForm.selectedStops.length} selected)`}>
              <div className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                {stops.map((s) => {
                  const idx = routeForm.selectedStops.indexOf(s.id);
                  return (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ncrtc-mist">
                      <input type="checkbox" checked={idx >= 0} onChange={() => toggleStop(s.id)} />
                      <span className="w-5 text-xs text-slate-400">{idx >= 0 ? idx + 1 : ""}</span>
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <button className="btn-accent">Create route</button>
            {hasRole("admin") && routes.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="label">Existing routes</p>
                <ul className="mt-1 max-h-32 space-y-1 overflow-auto text-sm">
                  {routes.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span>
                        {r.code} · {r.name}
                      </span>
                      <button type="button" className="text-xs text-red-600 underline" onClick={() => deleteRoute(r.id)}>
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
