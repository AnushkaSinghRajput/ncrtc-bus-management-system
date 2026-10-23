export type Role =
  | "driver"
  | "conductor"
  | "depot_manager"
  | "control_room_operator"
  | "admin";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  depot_id: number | null;
  phone: string | null;
}

export interface Depot {
  id: number;
  code: string;
  name: string;
  location_lat: number;
  location_lng: number;
  polygon_geojson: GeoJSON.Polygon;
}

export interface Vehicle {
  id: number;
  reg_no: string;
  depot_id: number;
  status: string;
}

export interface Stop {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface RouteStop {
  id: number;
  stop_id: number;
  sequence: number;
  planned_offset_min: number;
  stop?: Stop;
}

export interface Route {
  id: number;
  code: string;
  name: string;
  depot_id: number;
  stops: RouteStop[];
}

export interface Duty {
  id: number;
  date: string;
  vehicle_id: number;
  driver_id: number;
  conductor_id: number | null;
  route_id: number;
  depot_id: number;
  start_time: string;
  end_time: string;
  status: string;
  ack_at: string | null;
  vehicle?: Vehicle;
  driver?: User;
  route?: Route;
}

export interface LiveVehicle {
  vehicle_id: number;
  reg_no: string;
  depot_id: number;
  status: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  ts: string;
  driver_name?: string | null;
  route_code?: string | null;
  route_name?: string | null;
}

export interface GpsPing {
  id: number;
  vehicle_id: number;
  ts: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  ignition_on: boolean;
}

export interface Incident {
  id: number;
  type: string;
  severity: string;
  status: string;
  raised_by: number;
  assigned_to: number | null;
  vehicle_id: number | null;
  depot_id: number | null;
  description: string;
  photo_path: string | null;
  location_lat: number | null;
  location_lng: number | null;
  created_at: string;
  resolved_at: string | null;
  events?: IncidentEvent[];
  raiser?: User;
  assignee?: User;
  vehicle?: Vehicle;
}

export interface IncidentEvent {
  id: number;
  ts: string;
  actor_id: number;
  from_status: string | null;
  to_status: string;
  note: string;
  actor?: User;
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  audience_json: Record<string, unknown>;
  publish_at: string;
  created_by: number;
  ack_required: boolean;
  created_at: string;
  read: boolean;
  acknowledged: boolean;
}
