import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Depot, GpsPing, LiveVehicle } from "../types";

const busIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:999px;background:#1F7A6D;border:2px solid white;box-shadow:0 0 0 2px #0B3D5C"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    }
  }, [map, points]);
  return null;
}

export default function AvlsPage() {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [depotId, setDepotId] = useState<string>("");
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [selected, setSelected] = useState<LiveVehicle | null>(null);
  const [trail, setTrail] = useState<GpsPing[]>([]);
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
          setVehicles(data);
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

  useEffect(() => {
    if (!selected) {
      setTrail([]);
      return;
    }
    api<GpsPing[]>(`/api/avls/vehicles/${selected.vehicle_id}/trail?minutes=30`)
      .then(setTrail)
      .catch(() => setTrail([]));
  }, [selected]);

  const points = useMemo(
    () => vehicles.map((v) => [v.lat, v.lng] as [number, number]),
    [vehicles],
  );

  if (loading) return <Loading label="Loading live fleet…" />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-4 animate-rise">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ncrtc-navy">AVLS · Live map</h1>
          <p className="text-sm text-slate-600">
            Markers refresh every 5s. Positions are <strong>simulated</strong> by the GPS tick service.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="label">Depot filter</label>
            <select className="input" value={depotId} onChange={(e) => setDepotId(e.target.value)}>
              <option value="">All depots</option>
              {depots.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-full bg-ncrtc-teal/10 px-3 py-1 text-xs text-ncrtc-teal">
            Updated {updatedAt || "—"} · {vehicles.length} buses
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="panel h-[560px] overflow-hidden">
          {vehicles.length === 0 ? (
            <Empty message="No live GPS pings yet. Wait for the tick script." />
          ) : (
            <MapContainer center={[28.61, 77.35]} zoom={11} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={points} />
              {vehicles.map((v) => (
                <Marker
                  key={v.vehicle_id}
                  position={[v.lat, v.lng]}
                  icon={busIcon}
                  eventHandlers={{ click: () => setSelected(v) }}
                >
                  <Popup>
                    <strong>{v.reg_no}</strong>
                    <br />
                    {v.speed_kmh.toFixed(0)} km/h
                  </Popup>
                </Marker>
              ))}
              {trail.length > 1 && (
                <Polyline
                  positions={trail.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: "#C9A227", weight: 4 }}
                />
              )}
            </MapContainer>
          )}
        </div>
        <aside className="panel p-4">
          <h2 className="font-semibold text-ncrtc-navy">Vehicle detail</h2>
          {!selected ? (
            <p className="mt-3 text-sm text-slate-500">Click a marker to inspect the last 30 minutes.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <Row label="Reg no" value={selected.reg_no} />
              <Row label="Driver" value={selected.driver_name || "—"} />
              <Row label="Route" value={selected.route_code ? `${selected.route_code} · ${selected.route_name}` : "—"} />
              <Row label="Speed" value={`${selected.speed_kmh.toFixed(1)} km/h`} />
              <Row label="Last ping" value={new Date(selected.ts).toLocaleString()} />
              <Row label="Trail points" value={String(trail.length)} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
