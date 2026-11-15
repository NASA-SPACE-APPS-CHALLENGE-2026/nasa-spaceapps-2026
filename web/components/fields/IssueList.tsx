import type { GeometryIssue } from '@/lib/domain/validation';

export function IssueList({ issues }: { issues: GeometryIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-2" aria-live="polite">
      {issues.map((i) => (
        <li
          key={i.code + i.message}
          role={i.level === 'error' ? 'alert' : undefined}
          className={`rounded-parcel px-3 py-2 text-[14.5px] leading-snug ${i.level === 'error' ? 'bg-alert-tint text-[#7a2c1d]' : 'bg-wheat-tint text-wheat-deep'}`}
        >
          {i.message}
        </li>
      ))}
    </ul>
  );
}
