/**
 * Class strings shared by the UI primitives. Everything in the page uses the 4px parcel radius;
 * only things that float over the map or page use the 14px float radius and the float shadow.
 */

/** Text inputs, selects and number fields. Error state comes from aria-invalid. */
export const INPUT =
  'block min-h-12 w-full rounded-parcel border border-line-strong bg-panel px-3 text-[16px] text-ink transition-colors ' +
  'placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-field focus-visible:outline-2 focus-visible:outline-offset-0 ' +
  'disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-faint aria-[invalid=true]:border-alert aria-[invalid=true]:bg-alert-tint/40';

export const LABEL = 'block text-[15px] font-semibold text-ink';
export const HINT = 'mt-1 text-[14px] text-ink-soft';
export const ERROR = 'mt-1 text-[14px] font-semibold text-alert';

/** A raised surface. Used sparingly: most sections are separated by whitespace and thin rules instead. */
export const PANEL = 'rounded-parcel border border-line bg-panel';

/** Surface that floats over imagery or content: frosted, with the float radius and shadow. */
export const FLOAT = 'rounded-float border border-line/70 bg-panel/95 shadow-float backdrop-blur-md';

/** Inline text link (blue is reserved for links and water). */
export const LINK = 'font-semibold text-water underline decoration-water/40 underline-offset-[3px] hover:decoration-water';
