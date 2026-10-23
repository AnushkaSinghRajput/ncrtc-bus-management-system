import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ErrorBox } from "../components/States";
import { Icon } from "../components/ui";

const demos: { username: string; role: string; scope: string }[] = [
  { username: "admin", role: "Administrator", scope: "All modules" },
  { username: "manager1", role: "Depot manager", scope: "Noida Sec-37" },
  { username: "control1", role: "Control room", scope: "Live map & IMS" },
  { username: "driver1", role: "Driver", scope: "Phone app" },
];

const features: { icon: Parameters<typeof Icon>[0]["name"]; title: string; text: string }[] = [
  { icon: "map", title: "Live fleet tracking", text: "5-second map refresh, geofence alerts and trip replay." },
  { icon: "calendar", title: "Duty rostering", text: "Weekly grid with conflict checks and one-click publishing." },
  { icon: "alert", title: "Incident response", text: "Panic alerts, SLA timers and an auditable timeline." },
  { icon: "megaphone", title: "Driver notices", text: "Targeted broadcasts with read and acknowledgement tracking." },
];

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("password");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={user.role === "driver" || user.role === "conductor" ? "/driver" : "/"} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await login(username.trim(), password);
      navigate(u.role === "driver" || u.role === "conductor" ? "/driver" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ncrtc-navy">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 500px at 85% 10%, rgba(201,162,39,0.22), transparent 60%), radial-gradient(800px 600px at 0% 100%, rgba(31,122,109,0.55), transparent 60%), linear-gradient(120deg, #0B3D5C 0%, #0E4A63 55%, #1F7A6D 100%)",
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden="true">
        <defs>
          <pattern id="routes" width="220" height="220" patternUnits="userSpaceOnUse">
            <path d="M0 160 C60 120 100 200 160 140 S220 60 220 60" fill="none" stroke="white" strokeWidth="1.5" />
            <path d="M0 40 C70 70 120 0 220 30" fill="none" stroke="white" strokeWidth="1" strokeDasharray="4 6" />
            <circle cx="160" cy="140" r="3" fill="white" />
            <circle cx="60" cy="52" r="2.5" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#routes)" />
      </svg>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="animate-rise text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ncrtc-gold font-display text-2xl font-bold text-ncrtc-navy">
              N
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">National Capital Region Transport Corporation</div>
          </div>
          <h1 className="mt-8 font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
            Bus Management
            <br />
            <span className="text-ncrtc-gold">System</span>
          </h1>
          <p className="mt-5 max-w-lg text-base text-white/80">
            One control surface for the RRTS feeder bus network: where every bus is, who is driving it, what went wrong, and who has
            been told.
          </p>
          <ul className="mt-10 hidden gap-5 sm:grid sm:grid-cols-2">
            {features.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-ncrtc-gold ring-1 ring-white/15">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={onSubmit} className="animate-rise rounded-3xl bg-white p-8 shadow-2xl">
          <h2 className="font-display text-2xl text-ncrtc-navy">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Demo accounts all use the password <code className="rounded bg-ncrtc-mist px-1.5 py-0.5 text-ncrtc-navy">password</code>.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="username">
                Username
              </label>
              <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  className="input pr-16"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-ncrtc-teal hover:underline"
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <button className="btn-primary h-11 w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>

          <div className="mt-7 border-t border-slate-100 pt-5">
            <p className="label">Quick demo accounts</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {demos.map((d) => {
                const active = username === d.username;
                return (
                  <button
                    key={d.username}
                    type="button"
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      active ? "border-ncrtc-teal bg-teal-50/70 ring-1 ring-ncrtc-teal" : "border-slate-200 hover:border-ncrtc-teal/50 hover:bg-ncrtc-mist"
                    }`}
                    onClick={() => {
                      setUsername(d.username);
                      setPassword("password");
                    }}
                  >
                    <span className="block text-sm font-semibold text-ncrtc-navy">{d.role}</span>
                    <span className="block text-xs text-slate-500">
                      {d.username} · {d.scope}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
