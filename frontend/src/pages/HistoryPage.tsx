import { FormEvent, useEffect, useState } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../lib/api";
import { toLocalDateString } from "../lib/dates";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { GpsPing, Vehicle } from "../types";

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30] });
  }, [map, points]);
  return null;
}

export default function HistoryPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [day, setDay] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalDateString(d);
  });
  const [pings, setPings] = useState<GpsPing[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    api<Vehicle[]>("/api/vehicles")
      .then((v) => {
        setVehicles(v);
        if (v[0]) setVehicleId(String(v[0].id));
      })
      .catch((e) => setError(e.message))
      .finally(() => setBooting(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<GpsPing[]>(`/api/avls/history?vehicle_id=${vehicleId}&day=${day}`);
      setPings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (booting) return <Loading />;

  const points = pings.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <div className="space-y-4 animate-rise">
      <div>
        <h1 className="font-display text-3xl text-ncrtc-navy">AVLS · Trip history</h1>
        <p className="text-sm text-slate-600">Pick a vehicle and date to draw that day’s GPS trail.</p>
      </div>
      <form onSubmit={onSubmit} className="panel flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Vehicle</label>
          <select className="input min-w-[200px]" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
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
          {loading ? "Loading…" : "Show path"}
        </button>
      </form>
      {error && <ErrorBox message={error} />}
      <div className="panel h-[520px] overflow-hidden">
        {pings.length === 0 ? (
          <Empty message="No trail for this selection. Try yesterday for seeded history." />
        ) : (
          <MapContainer center={points[0]} zoom={12} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Fit points={points} />
            <Polyline positions={points} pathOptions={{ color: "#0B3D5C", weight: 5 }} />
          </MapContainer>
        )}
      </div>
      {pings.length > 0 && (
        <p className="text-sm text-slate-600">
          {pings.length} pings from {new Date(pings[0].ts).toLocaleTimeString()} to{" "}
          {new Date(pings[pings.length - 1].ts).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
