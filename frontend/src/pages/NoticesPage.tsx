import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import { Badge, Icon, Notice as Banner, PageHeader, SectionTitle } from "../components/ui";
import type { Depot, Notice, Role } from "../types";

interface AudienceMember {
  user_id: number;
  username: string;
  full_name: string;
  role: Role;
  depot_id: number | null;
  read_at: string | null;
  acknowledged: boolean;
}

interface Audience {
  notice_id: number;
  total: number;
  read: number;
  acknowledged: number;
  members: AudienceMember[];
}

type AudienceTab = "unread" | "read" | "acknowledged";

function describeAudience(aud: Record<string, unknown>, depots: Depot[]): string {
  switch (aud.type) {
    case "all":
      return "Everyone";
    case "role":
      return `Role · ${String(aud.role).replace(/_/g, " ")}`;
    case "depot":
      return depots.find((d) => d.id === aud.depot_id)?.name ?? `Depot ${aud.depot_id}`;
    default:
      return "All drivers";
  }
}

export default function NoticesPage() {
  const { hasRole } = useAuth();
  const canTrack = hasRole("admin", "depot_manager");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [tab, setTab] = useState<AudienceTab>("unread");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    body: "",
    audienceType: "all_drivers",
    depot_id: "",
    role: "driver",
    ack_required: false,
  });

  async function load() {
    setNotices(await api<Notice[]>("/api/notices"));
  }

  useEffect(() => {
    Promise.all([load(), api<Depot[]>("/api/depots")])
      .then(([, d]) => setDepots(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const selected = notices.find((n) => n.id === selectedId) ?? null;

  async function openNotice(n: Notice) {
    setSelectedId(n.id);
    setAudience(null);
    setTab("unread");
    try {
      if (!n.read) {
        await api(`/api/notices/${n.id}/read`, { method: "POST" });
        await load();
      }
      if (canTrack) setAudience(await api<Audience>(`/api/notices/${n.id}/audience`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function ack() {
    if (!selected) return;
    await api(`/api/notices/${selected.id}/acknowledge`, { method: "POST" });
    await load();
    if (canTrack) setAudience(await api<Audience>(`/api/notices/${selected.id}/audience`));
  }

  async function createNotice(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const aud =
      form.audienceType === "depot"
        ? { type: "depot", depot_id: Number(form.depot_id) }
        : form.audienceType === "role"
          ? { type: "role", role: form.role }
          : { type: form.audienceType };
    try {
      const created = await api<Notice>("/api/notices", {
        method: "POST",
        body: JSON.stringify({ title: form.title, body: form.body, audience: aud, ack_required: form.ack_required }),
      });
      setForm({ ...form, title: "", body: "" });
      setComposing(false);
      setMsg(`Published “${created.title}”`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <Loading />;

  const filtered = notices.filter((n) => {
    if (unreadOnly && n.read) return false;
    const q = search.trim().toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  const tabMembers = (audience?.members ?? []).filter((m) =>
    tab === "unread" ? !m.read_at : tab === "read" ? m.read_at && !m.acknowledged : m.acknowledged,
  );

  return (
    <div className="space-y-6 animate-rise">
      <PageHeader
        eyebrow="CMS"
        title="Notices"
        description="Publish operational notices to drivers, depots or roles, and see exactly who has and hasn't read them."
        actions={
          hasRole("admin") && (
            <button className={composing ? "btn-ghost" : "btn-primary"} onClick={() => setComposing((c) => !c)}>
              <Icon name={composing ? "close" : "megaphone"} className="h-4 w-4" />
              {composing ? "Cancel" : "New notice"}
            </button>
          )
        }
      />
      {error && <ErrorBox message={error} />}
      {msg && <Banner>{msg}</Banner>}

      {composing && hasRole("admin") && (
        <form onSubmit={createNotice} className="panel grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea className="input min-h-[140px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Audience</label>
              <select className="input" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}>
                <option value="all_drivers">All drivers & conductors</option>
                <option value="all">Everyone</option>
                <option value="depot">Specific depot</option>
                <option value="role">Specific role</option>
              </select>
            </div>
            {form.audienceType === "depot" && (
              <div>
                <label className="label">Depot</label>
                <select className="input" value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })} required>
                  <option value="">Select depot</option>
                  {depots.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.audienceType === "role" && (
              <div>
                <label className="label">Role</label>
                <select className="input capitalize" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {["driver", "conductor", "depot_manager", "control_room_operator"].map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="accent-ncrtc-teal"
                checked={form.ack_required}
                onChange={(e) => setForm({ ...form, ack_required: e.target.checked })}
              />
              Require explicit acknowledgement
            </label>
            <button className="btn-primary mt-auto w-full">Publish notice</button>
          </div>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="panel flex max-h-[680px] flex-col p-3">
          <div className="flex items-center gap-2 p-1">
            <input className="input" placeholder="Search notices…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-slate-500">
            <input type="checkbox" className="accent-ncrtc-teal" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only · {notices.filter((n) => !n.read).length} unread
          </label>
          {filtered.length === 0 ? (
            <div className="p-4">
              <Empty message="No notices." />
            </div>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {filtered.map((n) => (
                <li key={n.id}>
                  <button
                    className={`w-full rounded-xl px-3 py-3 text-left transition ${
                      n.id === selectedId ? "bg-ncrtc-navy text-white" : "hover:bg-ncrtc-mist"
                    }`}
                    onClick={() => openNotice(n)}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : n.id === selectedId ? "bg-ncrtc-gold" : "bg-ncrtc-teal"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm ${n.read ? "font-medium" : "font-semibold"}`}>{n.title}</div>
                        <div className={`mt-0.5 line-clamp-1 text-xs ${n.id === selectedId ? "text-white/70" : "text-slate-500"}`}>{n.body}</div>
                        <div className={`mt-1.5 flex items-center gap-2 text-[11px] ${n.id === selectedId ? "text-white/60" : "text-slate-400"}`}>
                          <span>{new Date(n.publish_at).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                          <span>·</span>
                          <span className="truncate">{describeAudience(n.audience_json, depots)}</span>
                          {n.ack_required && !n.acknowledged && <span className="ml-auto font-semibold text-amber-500">Ack</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-6">
          {!selected ? (
            <div className="panel flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ncrtc-sand text-ncrtc-teal">
                <Icon name="megaphone" />
              </span>
              <p className="mt-3 font-medium text-ncrtc-navy">Select a notice to read it</p>
              <p className="mt-1 text-sm text-slate-500">Opening a notice marks it as read for you.</p>
            </div>
          ) : (
            <article className="panel p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="blue">{describeAudience(selected.audience_json, depots)}</Badge>
                {selected.ack_required && (
                  <Badge tone={selected.acknowledged ? "green" : "amber"}>
                    {selected.acknowledged ? "You acknowledged" : "Acknowledgement required"}
                  </Badge>
                )}
              </div>
              <h2 className="mt-3 font-display text-2xl text-ncrtc-navy">{selected.title}</h2>
              <p className="mt-1 text-xs text-slate-400">Published {new Date(selected.publish_at).toLocaleString()}</p>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selected.body}</p>
              {selected.ack_required && !selected.acknowledged && (
                <button className="btn-accent mt-5" onClick={ack}>
                  I have read and understood
                </button>
              )}
            </article>
          )}

          {selected && canTrack && (
            <section className="panel p-5">
              <SectionTitle>Read receipts</SectionTitle>
              {!audience ? (
                <Loading label="Loading audience…" />
              ) : audience.total === 0 ? (
                <Empty message="Nobody in your scope is targeted by this notice." />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Meter label="Read" value={audience.read} total={audience.total} bar="bg-ncrtc-teal" />
                    <Meter label="Acknowledged" value={audience.acknowledged} total={audience.total} bar="bg-emerald-500" />
                    <Meter label="Not yet read" value={audience.total - audience.read} total={audience.total} bar="bg-amber-500" />
                  </div>
                  <div className="mt-5 flex rounded-lg bg-ncrtc-mist p-1 text-sm" role="tablist">
                    {(
                      [
                        ["unread", `Not read (${audience.total - audience.read})`],
                        ["read", `Read only (${audience.read - audience.acknowledged})`],
                        ["acknowledged", `Acknowledged (${audience.acknowledged})`],
                      ] as [AudienceTab, string][]
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={tab === k}
                        onClick={() => setTab(k)}
                        className={`h-8 flex-1 rounded-md px-3 text-xs font-semibold transition ${
                          tab === k ? "bg-white text-ncrtc-navy shadow-sm" : "text-slate-500 hover:text-ncrtc-navy"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ul className="mt-3 grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
                    {tabMembers.map((m) => (
                      <li key={m.user_id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-ncrtc-mist">
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ncrtc-navy">{m.full_name}</span>
                          <span className="block text-xs capitalize text-slate-400">
                            {m.role.replace(/_/g, " ")} · {depots.find((d) => d.id === m.depot_id)?.code ?? "—"}
                          </span>
                        </span>
                        <span className="text-right text-xs text-slate-400">
                          {m.read_at ? new Date(m.read_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </span>
                      </li>
                    ))}
                    {tabMembers.length === 0 && <li className="px-3 py-4 text-sm text-slate-400">Nobody in this group.</li>}
                  </ul>
                </>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  );
}

function Meter({ label, value, total, bar }: { label: string; value: number; total: number; bar: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl bg-ncrtc-mist p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="font-display text-xl text-ncrtc-navy">
          {value}
          <span className="text-sm text-slate-400">/{total}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
