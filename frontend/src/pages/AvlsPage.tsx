import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, PageHeader } from "../components/ui";
import type { Depot, GpsPing, LiveVehicle } from "../types";

type MotionState = "moving" | "stopped" | "stale";

const STALE_MS = 2 * 60 * 1000;

const MOTION: Record<MotionState, { label: string; color: string }> = {
  moving: { label: "Moving", color: "#1F7A6D" },
  stopped: { label: "Stopped", color: "#C9A227" },
  stale: { label: "No signal > 2 min", color: "#94A3B8" },
};

export function motionState(v: Pick<LiveVehicle, "speed_kmh" | "ts">, now = Date.now()): MotionState {
  if (now - new Date(v.ts).getTime() > STALE_MS) return "stale";
  return v.speed_kmh > 1 ? "moving" : "stopped";
}

const iconCache = new Map<string, L.DivIcon>();
function markerIcon(state: MotionState, selected: boolean) {
  const key = `${state}-${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const size = selected ? 22 : 14;
    const ring = selected ? "0 0 0 4px rgba(11,61,92,0.35), 0 0 0 2px #0B3D5C" : "0 0 0 2px #0B3D5C";
    icon = new L.DivIcon({
      className: "",
      html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${MOTION[state].color};border:2px solid white;box-shadow:${ring}"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

function FitOnce({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (points.length && lastKey.current !== fitKey) {
      lastKey.current = fitKey;
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    }
  }, [map, points, fitKey]);
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 13), { duration: 0.6 });
  }, [map, target]);
  return null;
}

export default function AvlsPage() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [depotId, setDepotId] = useState<string>("");
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [trail, setTrail] = useState<GpsPing[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    api<Depot[]>("/api/depots").then(setDepots).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const q = depotId ? `?depot_id=${depotId}` : "";
        const data = await api<LiveVehicle[]>(`/api/avls/live${q}`);
        if (!cancelled) {
          setVehicles(data.sort((a, b) => a.reg_no.localeCompare(b.reg_no)));
          setUpdatedAt(new Date().toLocaleTimeString());
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load live map");
          setLoading(false);
        }
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [depotId]);

  const selected = vehicles.find((v) => v.vehicle_id === selectedId) ?? null;
  const selectedTs = selected?.ts;

  useEffect(() => {
    if (!selectedId) {
      setTrail([]);
      return;
    }
    api<GpsPing[]>(`/api/avls/vehicles/${selectedId}/trail?minutes=30`)
      .then(setTrail)
      .catch(() => setTrail([]));
  }, [selectedId, selectedTs]);

  const points = useMemo(() => vehicles.map((v) => [v.lat, v.lng] as [number, number]), [vehicles]);
  const visibleDepots = depotId ? depots.filter((d) => String(d.id) === depotId) : depots;
  const depotName = (id: number) => depots.find((d) => d.id === id)?.name ?? `Depot ${id}`;

  const filtered = vehicles.filter((v) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [v.reg_no, v.driver_name, v.route_code].some((f) => f?.toLowerCase().includes(q));
  });

  const counts = vehicles.reduce(
    (acc, v) => {
      acc[motionState(v)] += 1;
      return acc;
    },
    { moving: 0, stopped: 0, stale: 0 } as Record<MotionState, number>,
  );

  function pick(v: LiveVehicle) {
    setSelectedId(v.vehicle_id);
    setFocus([v.lat, v.lng]);
  }

  if (loading) return <Loading label="Loading live fleet…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="AVLS"
        title="Live fleet map"
        description={
          <>
            Positions refresh every 5 seconds and are <strong>simulated</strong> by the GPS tick service.
          </>
        }
        actions={
          <>
            <div className="w-56">
              <label className="label">Depot</label>
              <select
                className="input"
                value={depotId}
                onChange={(e) => {
                  setDepotId(e.target.value);
                  setSelectedId(null);
                }}
              >
                <option value="">All depots</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex h-10 items-center gap-2 rounded-lg bg-ncrtc-teal/10 px-3 text-xs font-medium text-ncrtc-teal">
              <span className="h-2 w-2 animate-pulseDot rounded-full bg-ncrtc-teal" />
              Updated {updatedAt || "—"}
            </div>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel relative h-[600px] overflow-hidden">
          {vehicles.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty message="No live GPS pings yet. Wait for the tick script." />
            </div>
          ) : (
            <MapContainer center={[28.61, 77.35]} zoom={11} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitOnce points={points} fitKey={depotId || "all"} />
              <FlyTo target={focus} />
              {visibleDepots.map((d) => (
                <GeoJSON
                  key={d.id}
                  data={d.polygon_geojson}
                  style={{ color: "#0B3D5C", weight: 1.5, dashArray: "4 4", fillColor: "#1F7A6D", fillOpacity: 0.06 }}
                >
                  <Tooltip sticky>{d.name}</Tooltip>
                </GeoJSON>
              ))}
              {vehicles.map((v) => (
                <Marker
                  key={v.vehicle_id}
                  position={[v.lat, v.lng]}
                  icon={markerIcon(motionState(v), v.vehicle_id === selectedId)}
                  zIndexOffset={v.vehicle_id === selectedId ? 1000 : 0}
                  eventHandlers={{ click: () => setSelectedId(v.vehicle_id) }}
                >
                  <Popup>
                    <strong>{v.reg_no}</strong>
                    <br />
                    {v.route_code ?? "No duty"} · {v.speed_kmh.toFixed(0)} km/h
                  </Popup>
                </Marker>
              ))}
              {trail.length > 1 && (
                <Polyline
                  positions={trail.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: "#C9A227", weight: 4, opacity: 0.85 }}
                />
              )}
            </MapContainer>
          )}
          <div className="pointer-events-none absolute bottom-4 left-4 z-[400] rounded-xl bg-white/95 px-4 py-3 text-xs shadow-lg ring-1 ring-slate-200">
            <div className="mb-2 font-semibold uppercase tracking-wider text-slate-500">Legend</div>
            <ul className="space-y-1.5">
              {(Object.keys(MOTION) as MotionState[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full ring-2 ring-white" style={{ background: MOTION[k].color }} />
                  <span className="text-slate-700">{MOTION[k].label}</span>
                  <span className="ml-auto pl-4 font-semibold tabular-nums text-ncrtc-navy">{counts[k]}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 pt-1">
                <span className="h-0.5 w-3 bg-ncrtc-gold" />
                <span className="text-slate-700">30-min trail</span>
              </li>
            </ul>
          </div>
        </div>

        <aside className="flex h-[600px] flex-col gap-4">
          <div className="panel p-5">
            {!selected ? (
              <div className="text-sm text-slate-500">
                <div className="font-semibold text-ncrtc-navy">Vehicle detail</div>
                <p className="mt-2">Select a bus on the map or from the list to see its driver, route and 30-minute trail.</p>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl text-ncrtc-navy">{selected.reg_no}</div>
                    <div className="text-xs text-slate-500">{depotName(selected.depot_id)}</div>
                  </div>
                  <Badge tone={motionState(selected) === "moving" ? "teal" : motionState(selected) === "stopped" ? "amber" : "slate"}>
                    {MOTION[motionState(selected)].label}
                  </Badge>
                </div>
                <dl className="mt-4 space-y-0 text-sm">
                  <Row label="Driver" value={selected.driver_name || "—"} />
                  <Row label="Route" value={selected.route_code ? `${selected.route_code} · ${selected.route_name}` : "—"} />
                  <Row label="Speed" value={`${selected.speed_kmh.toFixed(1)} km/h`} />
                  <Row label="Last ping" value={new Date(selected.ts).toLocaleTimeString()} />
                  <Row label="Trail points" value={String(trail.length)} />
                </dl>
                <div className="mt-4 flex gap-2">
                  <Link to={`/avls/history?vehicle=${selected.vehicle_id}`} className="btn-ghost btn-sm flex-1">
                    <Icon name="history" className="h-3.5 w-3.5" /> Replay today
                  </Link>
                  <button className="btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="panel flex min-h-0 flex-1 flex-col p-3">
            <input
              className="input"
              placeholder="Search reg no, driver or route…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {filtered.length} of {vehicles.length} buses
            </div>
            <ul className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {filtered.map((v) => {
                const state = motionState(v);
                return (
                  <li key={v.vehicle_id}>
                    <button
                      onClick={() => pick(v)}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        v.vehicle_id === selectedId ? "bg-ncrtc-navy text-white" : "hover:bg-ncrtc-mist"
                      }`}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MOTION[state].color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{v.reg_no}</span>
                        <span className={`block truncate text-xs ${v.vehicle_id === selectedId ? "text-white/70" : "text-slate-500"}`}>
                          {v.route_code ? `${v.route_code} · ${v.driver_name ?? ""}` : "No duty today"}
                        </span>
                      </span>
                      <span className="text-xs tabular-nums opacity-70">{v.speed_kmh.toFixed(0)} km/h</span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-2 py-4 text-center text-sm text-slate-400">No matches</li>}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-ncrtc-ink">{value}</dd>
    </div>
  );
}
