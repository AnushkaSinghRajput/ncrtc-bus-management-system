export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="panel flex items-center gap-3 px-5 py-6 text-sm text-slate-600 animate-rise" role="status">
      <span className="inline-block h-2.5 w-2.5 rounded-full bg-ncrtc-teal animate-pulseDot" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 animate-rise" role="alert">
      {message}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
