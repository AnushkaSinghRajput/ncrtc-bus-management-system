import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Role } from "../types";

const links: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/", label: "Dashboard" },
  { to: "/avls", label: "Live Map", roles: ["admin", "control_room_operator", "depot_manager"] },
  { to: "/avls/history", label: "History", roles: ["admin", "control_room_operator", "depot_manager"] },
  { to: "/scheduling", label: "Scheduling", roles: ["admin", "depot_manager"] },
  { to: "/incidents", label: "Incidents" },
  { to: "/notices", label: "Notices" },
  { to: "/driver", label: "Driver PWA", roles: ["driver", "conductor"] },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/60 bg-ncrtc-navy text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ncrtc-gold font-display text-lg font-bold text-ncrtc-navy">
              N
            </div>
            <div>
              <div className="font-display text-lg leading-tight tracking-tight">NCRTC</div>
              <div className="text-xs text-white/70">Bus Management System</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full bg-white/10 px-3 py-1">
              {user?.full_name} · {user?.role}
            </span>
            <button className="btn-ghost !py-1.5 !text-ncrtc-navy" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
          {links
            .filter((l) => !l.roles || hasRole(...l.roles))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
                    isActive ? "bg-white text-ncrtc-navy" : "text-white/80 hover:bg-white/10"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
