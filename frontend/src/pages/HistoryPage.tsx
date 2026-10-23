import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { toLocalDateString } from "../lib/dates";
import { formatDuration, pathLengthKm } from "../lib/geo";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Icon, PageHeader, StatCard } from "../components/ui";
import type { GpsPing, Vehicle } from "../types";

const SPEEDS = [1, 5, 20] as const;

const busIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:20px;height:20px;border-radius:999px;background:#C9A227;border:3px solid white;box-shadow:0 0 0 2px #0B3D5C,0 4px 10px rgba(0,0,0,.25)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

export default function HistoryPage() {
  const [params] = useSearchParams();
  const presetVehicle = params.get("vehicle");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(presetVehicle ?? "");
  const [day, setDay] = useState(() => {
    const preset = params.get("day");
    if (preset && /^\d{4}-\d{2}-\d{2}$/.test(preset)) return preset;
    const d = new Date();
    if (!presetVehicle) d.setDate(d.getDate() - 1);
    return toLocalDateString(d);
  });
  const [pings, setPings] = useState<GpsPing[]>([]);
  const [loadedLabel, setLoadedLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(5);

  const load = useCallback(async (vid: string, d: string, vlist: Vehicle[]) => {
    if (!vid) return;
    setLoading(true);
    setError("");
    setPlaying(false);
    try {
      const data = await api<GpsPing[]>(`/api/avls/history?vehicle_id=${vid}&day=${d}`);
      setPings(data);
      setCursor(data.length ? data.length - 1 : 0);
      const reg = vlist.find((v) => String(v.id) === vid)?.reg_no ?? `#${vid}`;
      setLoadedLabel(`${reg} · ${new Date(`${d}T12:00:00`).toLocaleDateString([], { dateStyle: "medium" })}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<Vehicle[]>("/api/vehicles")
      .then((v) => {
        setVehicles(v);
        const initial = presetVehicle ?? (v[0] ? String(v[0].id) : "");
        setVehicleId(initial);
        if (presetVehicle) load(presetVehicle, day, v);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor((c) => {
        const next = c + speed;
        if (next >= pings.length - 1) {
          setPlaying(false);
          return pings.length - 1;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, speed, pings.length]);

  const points = useMemo(() => pings.map((p) => [p.lat, p.lng] as [number, number]), [pings]);
  const travelled = points.slice(0, cursor + 1);
  const current = pings[cursor];

  const stats = useMemo(() => {
    if (pings.length < 2) return null;
    const durationMs = new Date(pings[pings.length - 1].ts).getTime() - new Date(pings[0].ts).getTime();
    const maxSpeed = Math.max(...pings.map((p) => p.speed_kmh));
    const avgSpeed = pings.reduce((s, p) => s + p.speed_kmh, 0) / pings.length;
    return { km: pathLengthKm(points), durationMs, maxSpeed, avgSpeed };
  }, [pings, points]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    load(vehicleId, day, vehicles);
  }

  function togglePlay() {
    if (!playing && cursor >= pings.length - 1) setCursor(0);
    setPlaying((p) => !p);
  }

  if (booting) return <Loading />;

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="AVLS"
        title="Trip history & replay"
        description="Draw a vehicle's GPS trail for any day, then scrub or play it back to see where the bus was at each moment."
      />

      <form onSubmit={onSubmit} className="panel grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
        <div>
          <label className="label">Vehicle</label>
          <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.reg_no}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={loading}>
          <Icon name="history" className="h-4 w-4" />
          {loading ? "Loading…" : "Show path"}
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Distance" value={`${stats.km.toFixed(1)} km`} hint={loadedLabel} />
          <StatCard label="Time on road" value={formatDuration(stats.durationMs)} hint={`${pings.length} GPS pings`} tone="blue" />
          <StatCard label="Average speed" value={`${stats.avgSpeed.toFixed(0)} km/h`} tone="green" />
          <StatCard label="Top speed" value={`${stats.maxSpeed.toFixed(0)} km/h`} tone="amber" />
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="h-[520px]">
          {pings.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty message="No trail for this selection. Try yesterday for seeded history." />
            </div>
          ) : (
            <MapContainer center={points[0]} zoom={12} className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Fit points={points} />
              <Polyline positions={points} pathOptions={{ color: "#94A3B8", weight: 4, opacity: 0.6 }} />
              <Polyline positions={travelled} pathOptions={{ color: "#0B3D5C", weight: 5 }} />
              <CircleMarker center={points[0]} radius={6} pathOptions={{ color: "#1F7A6D", fillOpacity: 1 }} />
              <CircleMarker
                center={points[points.length - 1]}
                radius={6}
                pathOptions={{ color: "#DC2626", fillOpacity: 1 }}
              />
              {current && <Marker position={[current.lat, current.lng]} icon={busIcon} />}
            </MapContainer>
          )}
        </div>

        {pings.length > 1 && current && (
          <div className="flex flex-col gap-4 border-t border-slate-100 p-4 sm:flex-row sm:items-center">
            <button
              type="button"
              className="btn-primary w-full sm:w-28"
              onClick={togglePlay}
              aria-label={playing ? "Pause replay" : "Play replay"}
            >
              <Icon name={playing ? "pause" : "play"} className="h-4 w-4" />
              {playing ? "Pause" : "Play"}
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={pings.length - 1}
                value={cursor}
                onChange={(e) => {
                  setPlaying(false);
                  setCursor(Number(e.target.value));
                }}
                className="w-full accent-ncrtc-navy"
                aria-label="Replay position"
              />
              <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500">
                <span>{new Date(pings[0].ts).toLocaleTimeString()}</span>
                <span className="font-semibold text-ncrtc-navy">
                  {new Date(current.ts).toLocaleTimeString()} · {current.speed_kmh.toFixed(0)} km/h
                </span>
                <span>{new Date(pings[pings.length - 1].ts).toLocaleTimeString()}</span>
              </div>
            </div>
            <div className="flex rounded-lg bg-ncrtc-mist p-1" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`h-8 rounded-md px-3 text-xs font-semibold transition ${
                    speed === s ? "bg-white text-ncrtc-navy shadow-sm" : "text-slate-500 hover:text-ncrtc-navy"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
