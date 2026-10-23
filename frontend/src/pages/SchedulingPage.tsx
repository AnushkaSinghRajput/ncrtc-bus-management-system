import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toLocalDateString, weekDateStrings } from "../lib/dates";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, Notice, PageHeader, SectionTitle } from "../components/ui";
import type { Depot, Duty, Route, Stop, User, Vehicle } from "../types";

const CELL_STYLES: Record<string, string> = {
  draft: "border-dashed border-slate-300 bg-white",
  published: "border-sky-200 bg-sky-50",
  acknowledged: "border-emerald-200 bg-emerald-50",
  completed: "border-slate-200 bg-slate-50",
  cancelled: "border-red-200 bg-red-50 opacity-60",
};

function weekFromOffset(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset * 7);
  return weekDateStrings(d);
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return {
    weekday: d.toLocaleDateString([], { weekday: "short" }),
    date: d.toLocaleDateString([], { day: "numeric", month: "short" }),
  };
}

export default function SchedulingPage() {
  const { hasRole } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => weekFromOffset(weekOffset), [weekOffset]);
  const today = toLocalDateString();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [driverFilter, setDriverFilter] = useState("");
  const [onlyRostered, setOnlyRostered] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const assignRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState({
    date: today,
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

  const loadReference = useCallback(async () => {
    const [dr, v, r, s, dep] = await Promise.all([
      api<User[]>("/api/users?role=driver"),
      api<Vehicle[]>("/api/vehicles"),
      api<Route[]>("/api/routes"),
      api<Stop[]>("/api/stops"),
      api<Depot[]>("/api/depots"),
    ]);
    setDrivers(dr);
    setVehicles(v);
    setRoutes(r);
    setStops(s);
    setDepots(dep);
    setForm((f) => ({
      ...f,
      vehicle_id: f.vehicle_id || String(v[0]?.id ?? ""),
      driver_id: f.driver_id || String(dr[0]?.id ?? ""),
      route_id: f.route_id || String(r[0]?.id ?? ""),
    }));
    setRouteForm((f) => ({ ...f, depot_id: f.depot_id || String(dep[0]?.id ?? "") }));
  }, []);

  const loadDuties = useCallback(async () => {
    setDuties(await api<Duty[]>(`/api/duties?from_date=${days[0]}&to_date=${days[6]}`));
  }, [days]);

  useEffect(() => {
    loadReference()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadReference]);

  useEffect(() => {
    loadDuties().catch((e) => setError(e.message));
  }, [loadDuties]);

  const byCell = useMemo(() => {
    const m = new Map<string, Duty>();
    duties.forEach((d) => m.set(`${d.driver_id}|${d.date}`, d));
    return m;
  }, [duties]);

  const driverRows = drivers.filter((d) => {
    if (onlyRostered && !duties.some((x) => x.driver_id === d.id)) return false;
    if (!driverFilter.trim()) return true;
    const q = driverFilter.toLowerCase();
    return d.full_name.toLowerCase().includes(q) || d.username.toLowerCase().includes(q);
  });

  const summary = ["draft", "published", "acknowledged"].map((s) => ({
    status: s,
    count: duties.filter((d) => d.status === s).length,
  }));

  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg("");
    setError("");
    try {
      setMsg(await fn());
      await loadDuties();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const assignDuty = (e: FormEvent) => {
    e.preventDefault();
    run("assign", async () => {
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
      return "Duty assigned as a draft. Publish it so the driver can see it.";
    });
  };

  const publishWeek = () =>
    run("publish-week", async () => {
      const res = await api<{ message: string }>(`/api/duties/publish-week?from_date=${days[0]}&to_date=${days[6]}`, {
        method: "POST",
      });
      return res.message;
    });

  const copyPreviousWeek = () => {
    const prev = weekFromOffset(weekOffset - 1)[0];
    if (!confirm(`Copy the roster from the week of ${prev} into this week as drafts?`)) return;
    run("copy", async () => {
      const res = await api<{ message: string }>(
        `/api/duties/copy-week?from_week_start=${prev}&to_week_start=${days[0]}`,
        { method: "POST" },
      );
      return res.message;
    });
  };

  const publishOne = (dutyId: number) =>
    run(`duty-${dutyId}`, async () => {
      await api(`/api/duties/${dutyId}/publish`, { method: "POST" });
      return `Duty #${dutyId} published`;
    });

  function prefill(driverId: number, date: string) {
    setForm((f) => ({ ...f, driver_id: String(driverId), date }));
    assignRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function createRoute(e: FormEvent) {
    e.preventDefault();
    if (routeForm.selectedStops.length < 2) {
      setError("Select at least 2 stops for the route");
      return;
    }
    await run("route", async () => {
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
      setRouteForm((f) => ({ ...f, code: "", name: "", selectedStops: [] }));
      await loadReference();
      return "Route created";
    });
  }

  async function deleteRoute(routeId: number) {
    if (!confirm("Delete this route?")) return;
    await run("route", async () => {
      await api(`/api/routes/${routeId}`, { method: "DELETE" });
      await loadReference();
      return "Route deleted";
    });
  }

  function toggleStop(id: number) {
    setRouteForm((f) => {
      const has = f.selectedStops.includes(id);
      return { ...f, selectedStops: has ? f.selectedStops.filter((x) => x !== id) : [...f.selectedStops, id] };
    });
  }

  if (loading) return <Loading label="Loading roster…" />;

  const first = dayLabel(days[0]);
  const last = dayLabel(days[6]);

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="Scheduling"
        title="Weekly roster"
        description="Assign drivers to buses and routes, then publish so duties appear in the driver app. Click an empty cell to pre-fill an assignment."
        actions={
          <>
            <button className="btn-ghost" onClick={copyPreviousWeek} disabled={busy === "copy"}>
              <Icon name="copy" className="h-4 w-4" />
              {busy === "copy" ? "Copying…" : "Copy last week"}
            </button>
            <button className="btn-accent" onClick={publishWeek} disabled={busy === "publish-week"}>
              {busy === "publish-week" ? "Publishing…" : "Publish week"}
            </button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}
      {msg && <Notice>{msg}</Notice>}

      <div className="panel flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm w-9 !px-0" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">
            ‹
          </button>
          <div className="min-w-[11rem] text-center">
            <div className="text-sm font-semibold text-ncrtc-navy">
              {first.date} – {last.date}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400">
              {weekOffset === 0 ? "This week" : weekOffset === 1 ? "Next week" : weekOffset === -1 ? "Last week" : `${weekOffset > 0 ? "+" : ""}${weekOffset} weeks`}
            </div>
          </div>
          <button className="btn-ghost btn-sm w-9 !px-0" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week">
            ›
          </button>
          {weekOffset !== 0 && (
            <button className="btn-sm text-xs font-semibold text-ncrtc-teal hover:underline" onClick={() => setWeekOffset(0)}>
              Today
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 lg:ml-4">
          {summary.map((s) => (
            <Badge key={s.status} value={s.status}>
              {s.count} {s.status}
            </Badge>
          ))}
        </div>
        <div className="flex flex-1 items-center gap-3 lg:justify-end">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" className="accent-ncrtc-teal" checked={onlyRostered} onChange={(e) => setOnlyRostered(e.target.checked)} />
            Rostered only
          </label>
          <input
            className="input max-w-xs"
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            placeholder="Search drivers…"
          />
        </div>
      </div>

      <div className="panel max-h-[640px] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 min-w-[200px] border-b border-slate-200 bg-ncrtc-navy px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                Driver
              </th>
              {days.map((d) => {
                const l = dayLabel(d);
                return (
                  <th
                    key={d}
                    className={`min-w-[132px] border-b border-slate-200 px-3 py-2 text-center ${
                      d === today ? "bg-ncrtc-teal text-white" : "bg-ncrtc-navy text-white"
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{l.weekday}</div>
                    <div className="text-sm font-semibold">{l.date}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {driverRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <Empty message="No drivers match the filter." />
                </td>
              </tr>
            ) : (
              driverRows.map((dr) => (
                <tr key={dr.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-2.5 group-hover:bg-ncrtc-mist">
                    <div className="font-medium text-ncrtc-navy">{dr.full_name}</div>
                    <div className="text-xs text-slate-400">{dr.username}</div>
                  </td>
                  {days.map((d) => {
                    const cell = byCell.get(`${dr.id}|${d}`);
                    return (
                      <td key={d} className={`border-b border-slate-100 p-1.5 align-top ${d === today ? "bg-teal-50/40" : ""}`}>
                        {cell ? (
                          <div className={`h-full rounded-lg border px-2.5 py-2 text-xs ${CELL_STYLES[cell.status] ?? ""}`}>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold text-ncrtc-navy">{cell.route?.code || `R${cell.route_id}`}</span>
                              <span className="tabular-nums text-slate-500">{cell.start_time.slice(0, 5)}</span>
                            </div>
                            <div className="mt-0.5 truncate text-slate-600">{cell.vehicle?.reg_no || `V${cell.vehicle_id}`}</div>
                            <div className="mt-1.5 flex items-center justify-between gap-1">
                              <Badge value={cell.status} />
                              {cell.status === "draft" && (
                                <button
                                  type="button"
                                  className="text-[11px] font-semibold text-ncrtc-teal hover:underline"
                                  disabled={busy === `duty-${cell.id}`}
                                  onClick={() => publishOne(cell.id)}
                                >
                                  {busy === `duty-${cell.id}` ? "…" : "Publish"}
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => prefill(dr.id, d)}
                            className="flex h-[74px] w-full items-center justify-center rounded-lg border border-transparent text-lg text-slate-200 transition hover:border-dashed hover:border-ncrtc-teal/40 hover:bg-teal-50/50 hover:text-ncrtc-teal"
                            aria-label={`Assign ${dr.full_name} on ${d}`}
                          >
                            +
                          </button>
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form ref={assignRef} onSubmit={assignDuty} className="panel space-y-4 p-5">
          <SectionTitle>Assign duty</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <Field label="Start">
              <input className="input" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
            </Field>
            <Field label="End">
              <input className="input" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
            </Field>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy === "assign"}>
              {busy === "assign" ? "Saving…" : "Save assignment"}
            </button>
          </div>
        </form>

        {hasRole("admin", "depot_manager") && (
          <form onSubmit={createRoute} className="panel space-y-4 p-5">
            <SectionTitle>Create route</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Field label="Code">
                <input className="input" value={routeForm.code} onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })} required minLength={2} />
              </Field>
              <Field label="Name">
                <input className="input" value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} required minLength={2} />
              </Field>
            </div>
            <Field label="Depot">
              <select className="input" value={routeForm.depot_id} onChange={(e) => setRouteForm({ ...routeForm, depot_id: e.target.value })} required>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Stops in order · ${routeForm.selectedStops.length} selected`}>
              <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5">
                {stops.map((s) => {
                  const idx = routeForm.selectedStops.indexOf(s.id);
                  return (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-ncrtc-mist">
                      <input type="checkbox" className="accent-ncrtc-teal" checked={idx >= 0} onChange={() => toggleStop(s.id)} />
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          idx >= 0 ? "bg-ncrtc-teal text-white" : "text-transparent"
                        }`}
                      >
                        {idx >= 0 ? idx + 1 : "·"}
                      </span>
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </Field>
            <div className="flex justify-end">
              <button className="btn-accent" disabled={busy === "route"}>
                Create route
              </button>
            </div>
            {hasRole("admin") && routes.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="label">Existing routes</p>
                <ul className="max-h-36 divide-y divide-slate-100 overflow-auto text-sm">
                  {routes.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>
                        <span className="font-semibold text-ncrtc-navy">{r.code}</span> · {r.name}
                      </span>
                      <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => deleteRoute(r.id)}>
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
