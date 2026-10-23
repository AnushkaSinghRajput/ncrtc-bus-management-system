import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, Notice, PageHeader, SectionTitle, StatCard } from "../components/ui";
import type { Depot, Role, User, Vehicle } from "../types";

const VEHICLE_STATUSES = ["active", "idle", "maintenance", "out_of_service"];
const ROLES: Role[] = ["driver", "conductor", "depot_manager", "control_room_operator", "admin"];
const DEPOT_SCOPED: Role[] = ["driver", "conductor", "depot_manager"];

type Tab = "vehicles" | "users";

export default function AdminPage() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>("vehicles");
  const [depots, setDepots] = useState<Depot[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [depotFilter, setDepotFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [vForm, setVForm] = useState({ reg_no: "", depot_id: "", status: "active" });
  const [uForm, setUForm] = useState({
    username: "",
    full_name: "",
    role: "driver" as Role,
    depot_id: "",
    phone: "",
    password: "",
  });

  async function loadAll() {
    const [d, v, u] = await Promise.all([
      api<Depot[]>("/api/depots"),
      api<Vehicle[]>("/api/vehicles"),
      api<User[]>("/api/users?include_inactive=true"),
    ]);
    setDepots(d);
    setVehicles(v);
    setUsers(u);
    setVForm((f) => ({ ...f, depot_id: f.depot_id || String(d[0]?.id ?? "") }));
    setUForm((f) => ({ ...f, depot_id: f.depot_id || String(d[0]?.id ?? "") }));
  }

  useEffect(() => {
    loadAll()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function act(fn: () => Promise<string>) {
    setError("");
    setMsg("");
    try {
      setMsg(await fn());
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const addVehicle = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      const v = await api<Vehicle>("/api/vehicles", {
        method: "POST",
        body: JSON.stringify({ reg_no: vForm.reg_no.trim(), depot_id: Number(vForm.depot_id), status: vForm.status }),
      });
      setVForm((f) => ({ ...f, reg_no: "" }));
      return `Vehicle ${v.reg_no} added`;
    });
  };

  const addUser = (e: FormEvent) => {
    e.preventDefault();
    act(async () => {
      const u = await api<User>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          username: uForm.username.trim(),
          full_name: uForm.full_name.trim(),
          role: uForm.role,
          depot_id: DEPOT_SCOPED.includes(uForm.role) ? Number(uForm.depot_id) : null,
          phone: uForm.phone || null,
          password: uForm.password,
        }),
      });
      setUForm((f) => ({ ...f, username: "", full_name: "", phone: "", password: "" }));
      return `User ${u.username} created`;
    });
  };

  const setVehicleStatus = (v: Vehicle, status: string) =>
    act(async () => {
      await api(`/api/vehicles/${v.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      return `${v.reg_no} set to ${status.replace(/_/g, " ")}`;
    });

  const toggleActive = (u: User) =>
    act(async () => {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !u.is_active }) });
      return `${u.full_name} ${u.is_active ? "deactivated" : "reactivated"}`;
    });

  if (loading) return <Loading label="Loading fleet and users…" />;

  const depotCode = (id: number | null) => depots.find((d) => d.id === id)?.code ?? "—";
  const q = search.trim().toLowerCase();

  const shownVehicles = vehicles.filter(
    (v) => (!depotFilter || String(v.depot_id) === depotFilter) && (!q || v.reg_no.toLowerCase().includes(q)),
  );
  const shownUsers = users.filter(
    (u) =>
      (showInactive || u.is_active !== false) &&
      (!depotFilter || String(u.depot_id) === depotFilter) &&
      (!roleFilter || u.role === roleFilter) &&
      (!q || u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="Administration"
        title="Fleet & users"
        description="Register buses, change their operating status, and manage staff accounts and roles across all depots."
      />
      {error && <ErrorBox message={error} />}
      {msg && <Notice>{msg}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Depots" value={depots.length} icon={<Icon name="map" />} tone="blue" />
        <StatCard
          label="Vehicles"
          value={vehicles.length}
          hint={`${vehicles.filter((v) => v.status === "maintenance").length} in maintenance`}
          icon={<Icon name="bus" />}
        />
        <StatCard
          label="Drivers & conductors"
          value={users.filter((u) => u.is_active !== false && (u.role === "driver" || u.role === "conductor")).length}
          icon={<Icon name="users" />}
          tone="green"
        />
        <StatCard
          label="Inactive accounts"
          value={users.filter((u) => u.is_active === false).length}
          icon={<Icon name="shield" />}
          tone="slate"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-200" role="tablist">
          {(["vehicles", "users"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold capitalize transition ${
                tab === t ? "bg-ncrtc-navy text-white" : "text-slate-500 hover:text-ncrtc-navy"
              }`}
            >
              <Icon name={t === "vehicles" ? "bus" : "users"} className="h-4 w-4" />
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-3 sm:justify-end">
          <input className="input max-w-xs" placeholder={tab === "vehicles" ? "Search reg no…" : "Search name or username…"} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input w-48" value={depotFilter} onChange={(e) => setDepotFilter(e.target.value)} aria-label="Depot filter">
            <option value="">All depots</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {tab === "users" && (
            <select className="input w-48 capitalize" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Role filter">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {tab === "vehicles" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="panel overflow-hidden">
            <div className="data-head grid grid-cols-[minmax(0,1fr)_120px_200px] gap-4 px-5 py-3">
              <span>Registration</span>
              <span>Depot</span>
              <span>Status</span>
            </div>
            {shownVehicles.length === 0 ? (
              <div className="p-6">
                <Empty message="No vehicles match." />
              </div>
            ) : (
              <ul className="max-h-[560px] overflow-y-auto">
                {shownVehicles.map((v) => (
                  <li key={v.id} className="data-row grid grid-cols-[minmax(0,1fr)_120px_200px] items-center gap-4 px-5 py-2.5 text-sm">
                    <span className="flex items-center gap-3">
                      <span className="font-medium text-ncrtc-navy">{v.reg_no}</span>
                      <Badge value={v.status} />
                    </span>
                    <span className="text-slate-500">{depotCode(v.depot_id)}</span>
                    <select
                      className="input !h-8 text-xs capitalize"
                      value={v.status}
                      onChange={(e) => setVehicleStatus(v, e.target.value)}
                      aria-label={`Status for ${v.reg_no}`}
                    >
                      {VEHICLE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={addVehicle} className="panel h-fit space-y-4 p-5">
            <SectionTitle>Register vehicle</SectionTitle>
            <div>
              <label className="label">Registration number</label>
              <input
                className="input uppercase"
                value={vForm.reg_no}
                onChange={(e) => setVForm({ ...vForm, reg_no: e.target.value })}
                placeholder="UP-16-AB-1234"
                required
                minLength={4}
              />
            </div>
            <div>
              <label className="label">Depot</label>
              <select className="input" value={vForm.depot_id} onChange={(e) => setVForm({ ...vForm, depot_id: e.target.value })} required>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Initial status</label>
              <select className="input capitalize" value={vForm.status} onChange={(e) => setVForm({ ...vForm, status: e.target.value })}>
                {VEHICLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary w-full">Add vehicle</button>
          </form>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2.5">
              <span className="text-xs text-slate-500">{shownUsers.length} accounts</span>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <input type="checkbox" className="accent-ncrtc-teal" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
            </div>
            <div className="data-head grid grid-cols-[minmax(0,1fr)_170px_80px_110px] gap-4 px-5 py-3">
              <span>Name</span>
              <span>Role</span>
              <span>Depot</span>
              <span className="text-right">Access</span>
            </div>
            {shownUsers.length === 0 ? (
              <div className="p-6">
                <Empty message="No users match." />
              </div>
            ) : (
              <ul className="max-h-[520px] overflow-y-auto">
                {shownUsers.map((u) => (
                  <li
                    key={u.id}
                    className={`data-row grid grid-cols-[minmax(0,1fr)_170px_80px_110px] items-center gap-4 px-5 py-2.5 text-sm ${
                      u.is_active === false ? "opacity-60" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ncrtc-navy">{u.full_name}</span>
                      <span className="block text-xs text-slate-400">
                        {u.username}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </span>
                    </span>
                    <span>
                      <Badge tone={u.role === "admin" ? "blue" : u.role === "depot_manager" ? "teal" : "slate"}>{u.role.replace(/_/g, " ")}</Badge>
                    </span>
                    <span className="text-slate-500">{depotCode(u.depot_id)}</span>
                    <span className="text-right">
                      <button
                        className={`btn-sm btn ${u.is_active === false ? "btn-accent" : "btn-ghost"}`}
                        disabled={u.id === me?.id}
                        onClick={() => toggleActive(u)}
                        title={u.id === me?.id ? "You cannot deactivate yourself" : undefined}
                      >
                        {u.is_active === false ? "Reactivate" : "Deactivate"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={addUser} className="panel h-fit space-y-4 p-5">
            <SectionTitle>Create account</SectionTitle>
            <div>
              <label className="label">Full name</label>
              <input className="input" value={uForm.full_name} onChange={(e) => setUForm({ ...uForm, full_name: e.target.value })} required minLength={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Username</label>
                <input
                  className="input"
                  value={uForm.username}
                  onChange={(e) => setUForm({ ...uForm, username: e.target.value })}
                  required
                  minLength={3}
                  pattern="[a-zA-Z0-9_.\-]+"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={uForm.phone} onChange={(e) => setUForm({ ...uForm, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Role</label>
                <select className="input capitalize" value={uForm.role} onChange={(e) => setUForm({ ...uForm, role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Depot</label>
                <select
                  className="input"
                  value={DEPOT_SCOPED.includes(uForm.role) ? uForm.depot_id : ""}
                  onChange={(e) => setUForm({ ...uForm, depot_id: e.target.value })}
                  disabled={!DEPOT_SCOPED.includes(uForm.role)}
                >
                  {!DEPOT_SCOPED.includes(uForm.role) && <option value="">All depots</option>}
                  {depots.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Initial password</label>
              <input
                className="input"
                type="password"
                value={uForm.password}
                onChange={(e) => setUForm({ ...uForm, password: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>
            </div>
            <button className="btn-primary w-full">Create account</button>
          </form>
        </div>
      )}
    </div>
  );
}
