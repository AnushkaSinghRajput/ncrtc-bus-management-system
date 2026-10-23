import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import type { Role } from "../types";
import { Icon } from "./ui";

type IconName = Parameters<typeof Icon>[0]["name"];

const links: { to: string; label: string; icon: IconName; roles?: Role[] }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/avls", label: "Live Map", icon: "map", roles: ["admin", "control_room_operator", "depot_manager"] },
  { to: "/avls/history", label: "History", icon: "history", roles: ["admin", "control_room_operator", "depot_manager"] },
  { to: "/scheduling", label: "Scheduling", icon: "calendar", roles: ["admin", "depot_manager"] },
  { to: "/incidents", label: "Incidents", icon: "alert" },
  { to: "/notices", label: "Notices", icon: "megaphone" },
  { to: "/driver", label: "My Duty", icon: "bus", roles: ["driver", "conductor"] },
];

const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator",
  depot_manager: "Depot Manager",
  control_room_operator: "Control Room",
  driver: "Driver",
  conductor: "Conductor",
};

function initials(name?: string) {
  return (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const visible = links.filter((l) => !l.roles || hasRole(...l.roles));

  const navItem = (l: (typeof links)[number], mobile = false) => (
    <NavLink
      key={l.to}
      to={l.to}
      end={l.to === "/" || l.to === "/avls"}
      className={({ isActive }) =>
        `group flex items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
          mobile ? "py-2.5" : "h-9"
        } ${isActive ? "bg-white text-ncrtc-navy shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`
      }
    >
      <Icon name={l.icon} className="h-4 w-4 shrink-0" />
      {l.label}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-ncrtc-navy text-white shadow-[0_8px_24px_rgba(11,61,92,0.25)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ncrtc-gold font-display text-lg font-bold text-ncrtc-navy shadow-inner">
              N
            </div>
            <div className="leading-tight">
              <div className="font-display text-lg tracking-tight">NCRTC</div>
              <div className="text-[11px] uppercase tracking-[0.16em] text-white/60">Bus Management</div>
            </div>
          </NavLink>

          <nav className="hidden items-center gap-1 lg:flex">{visible.map((l) => navItem(l))}</nav>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2.5 rounded-full bg-white/10 py-1 pl-1 pr-3 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ncrtc-teal text-xs font-bold">
                {initials(user?.full_name)}
              </span>
              <span className="leading-tight">
                <span className="block max-w-[10rem] truncate text-sm font-medium">{user?.full_name}</span>
                <span className="block text-[11px] text-white/60">{user ? ROLE_LABEL[user.role] : ""}</span>
              </span>
            </div>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10 lg:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle navigation"
              aria-expanded={open}
            >
              <Icon name={open ? "close" : "menu"} />
            </button>
          </div>
        </div>
        {open && (
          <nav className="mx-auto grid max-w-7xl gap-1 border-t border-white/10 px-4 py-3 sm:grid-cols-2 lg:hidden">
            {visible.map((l) => navItem(l, true))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200/70 py-4 text-center text-xs text-slate-500">
        NCRTC Bus Management System · Demo build · GPS feed is simulated
      </footer>
    </div>
  );
}
