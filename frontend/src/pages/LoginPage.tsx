import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ErrorBox } from "../components/States";

const demos = [
  ["admin", "Admin — all modules"],
  ["manager1", "Depot manager — Noida Sec-37"],
  ["control1", "Control room — live map"],
  ["driver1", "Driver PWA"],
];

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("password");
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
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(11,61,92,0.88), rgba(31,122,109,0.72)), url('https://images.unsplash.com/photo-1544620341-11bb3f6b2f4b?auto=format&fit=crop&w=1800&q=80')",
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10 md:flex-row md:items-center md:gap-16">
        <div className="mb-8 text-white md:mb-0 md:flex-1 animate-rise">
          <p className="font-display text-5xl font-bold tracking-tight md:text-6xl">NCRTC</p>
          <h1 className="mt-3 max-w-md text-2xl font-semibold leading-snug md:text-3xl">
            Bus Management System
          </h1>
          <p className="mt-3 max-w-md text-sm text-white/85">
            Live fleet view, duties, incidents, and driver notices for the RRTS feeder network.
            Demo data is seeded; GPS is simulated.
          </p>
        </div>
        <form onSubmit={onSubmit} className="panel w-full max-w-md p-6 animate-rise md:flex-none">
          <h2 className="font-display text-xl text-ncrtc-navy">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Demo credentials use password <code>password</code>.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="label">Username</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <ErrorBox message={error} />}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="label">Quick demo accounts</p>
            <div className="mt-2 grid gap-2">
              {demos.map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  className="btn-ghost justify-between text-left"
                  onClick={() => {
                    setUsername(u);
                    setPassword("password");
                  }}
                >
                  <span className="font-semibold">{u}</span>
                  <span className="text-xs text-slate-500">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
