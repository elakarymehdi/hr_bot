import { useEffect } from "react";

export default function ConfirmSignOutModal({ open, onClose, onConfirm }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-slide-up w-full max-w-sm rounded-2xl border border-slate-700/50 bg-slate-900/90 p-6 shadow-2xl shadow-indigo-500/5 backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-modal-title"
      >
        {/* Logout icon */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/25">
          <svg className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </div>

        <h3 id="signout-modal-title" className="text-center text-lg font-semibold tracking-tight">
          Sign out?
        </h3>
        <p className="mt-2 text-center text-sm text-slate-400">
          You'll need to sign back in to access the dashboard and manage profiles.
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-5 py-2.5 text-sm font-medium text-slate-300 shadow-sm transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-orange-400 hover:shadow-amber-500/30 active:scale-[0.97]"
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign Out
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
