/**
 * A small patchwork of parcels seen from above, used in empty states. Same crop colours as the app,
 * one parcel left blank with a dashed edge: the thing the farmer is about to add.
 */
export function ParcelArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 72" className={className} aria-hidden>
      <rect width="120" height="72" fill="#e9e3d4" />
      <path d="M0 0h46l-4 30H0Z" fill="#d9a521" />
      <path d="M46 0h40l2 26-46 4Z" fill="#527a24" />
      <path d="M86 0h34v34l-32-8Z" fill="#c9a96a" />
      <path d="M0 30h42l3 42H0Z" fill="#476a3a" />
      <path d="M88 26l32 8v38H84Z" fill="#9b8566" />
      <path d="M0 30h42M46 0l-4 30 3 42M42 30l46-4M86 0l2 26-4 46M88 26l32 8" fill="none" stroke="#fbfaf5" strokeWidth="2.5" />
      <path d="M50 36l32-3 -2 33H52Z" fill="#fbfaf5" stroke="#2e5426" strokeWidth="1.8" strokeDasharray="4 3" strokeLinejoin="round" />
      <path d="M66 44v12M60 50h12" stroke="#2e5426" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
