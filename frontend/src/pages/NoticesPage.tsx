import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Empty, ErrorBox, Loading } from "../components/States";
import type { Depot, Notice } from "../types";

interface Receipt {
  user_id: number;
  username: string;
  full_name: string;
  read_at: string;
  acknowledged: boolean;
}

export default function NoticesPage() {
  const { hasRole } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState("");
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
    const data = await api<Notice[]>("/api/notices");
    setNotices(data);
  }

  useEffect(() => {
    Promise.all([load(), api<Depot[]>("/api/depots")])
      .then(([, d]) => setDepots(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openNotice(n: Notice) {
    setSelected(n);
    try {
      await api(`/api/notices/${n.id}/read`, { method: "POST" });
      if (n.ack_required) {
        // leave ack explicit
      }
      await load();
      if (hasRole("admin", "depot_manager")) {
        const r = await api<Receipt[]>(`/api/notices/${n.id}/receipts`);
        setReceipts(r);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function ack() {
    if (!selected) return;
    await api(`/api/notices/${selected.id}/acknowledge`, { method: "POST" });
    await load();
    setSelected({ ...selected, acknowledged: true, read: true });
  }

  async function createNotice(e: FormEvent) {
    e.preventDefault();
    setError("");
    const audience =
      form.audienceType === "depot"
        ? { type: "depot", depot_id: Number(form.depot_id) }
        : form.audienceType === "role"
          ? { type: "role", role: form.role }
          : { type: form.audienceType };
    try {
      await api("/api/notices", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          audience,
          ack_required: form.ack_required,
        }),
      });
      setForm({ ...form, title: "", body: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="space-y-6 animate-rise">
      <div>
        <h1 className="font-display text-3xl text-ncrtc-navy">CMS · Notices</h1>
        <p className="text-sm text-slate-600">Publish messages and track who has read them.</p>
      </div>
      {error && <ErrorBox message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="font-semibold text-ncrtc-navy">Inbox</h2>
          {notices.length === 0 ? (
            <Empty message="No notices." />
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {notices.map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full items-start justify-between gap-3 px-1 py-3 text-left hover:bg-ncrtc-mist"
                    onClick={() => openNotice(n)}
                  >
                    <div>
                      <div className="font-medium">{n.title}</div>
                      <div className="text-xs text-slate-500">{new Date(n.publish_at).toLocaleString()}</div>
                    </div>
                    <span className={`text-xs uppercase ${n.read ? "text-slate-400" : "text-ncrtc-teal font-semibold"}`}>
                      {n.read ? "read" : "unread"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <div className="mt-4 rounded-lg border border-ncrtc-sand bg-ncrtc-mist p-4">
              <h3 className="font-semibold">{selected.title}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">{selected.body}</p>
              {selected.ack_required && !selected.acknowledged && (
                <button className="btn-accent mt-3" onClick={ack}>
                  Acknowledge
                </button>
              )}
              {receipts.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Read receipts</h4>
                  <ul className="mt-2 max-h-40 overflow-auto text-xs">
                    {receipts.map((r) => (
                      <li key={r.user_id} className="flex justify-between py-1">
                        <span>{r.full_name}</span>
                        <span>{r.acknowledged ? "acked" : "read"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {hasRole("admin") && (
          <form onSubmit={createNotice} className="panel space-y-3 p-4 h-fit">
            <h2 className="font-semibold text-ncrtc-navy">Publish notice</h2>
            <div>
              <label className="label">Title</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea className="input min-h-[120px]" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
            </div>
            <div>
              <label className="label">Audience</label>
              <select className="input" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })}>
                <option value="all_drivers">All drivers</option>
                <option value="all">Everyone</option>
                <option value="depot">Specific depot</option>
                <option value="role">Specific role</option>
              </select>
            </div>
            {form.audienceType === "depot" && (
              <select className="input" value={form.depot_id} onChange={(e) => setForm({ ...form, depot_id: e.target.value })}>
                <option value="">Select depot</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {form.audienceType === "role" && (
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {["driver", "conductor", "depot_manager", "control_room_operator"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.ack_required}
                onChange={(e) => setForm({ ...form, ack_required: e.target.checked })}
              />
              Acknowledgement required
            </label>
            <button className="btn-primary w-full">Publish</button>
          </form>
        )}
      </div>
    </div>
  );
}
