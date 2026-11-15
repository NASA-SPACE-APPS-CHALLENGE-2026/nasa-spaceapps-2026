'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragOverlay, MouseSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useEffect, useId, useRef, useState } from 'react';
import { cropColor } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/domain/management';
import { addSeason, addTask, MAX_PLAN_SEASONS, moveTask, removeLastSeason, removeTask, renamePlan, setPlanCover, setPlanCrop, TASK_KIND_LABEL, TASK_KINDS, updateTask } from '@/lib/domain/plan';
import { COVER_SPECIES } from '@/lib/domain/rotation/coverCrops';
import type { CropRef, Plan, PlanSeason, PlanTask, PlanTaskKind } from '@/lib/domain/types';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { CropPicker } from '../fields/CropPicker';
import { Button } from '../ui/Button';
import { FieldPicker, NoFieldsYet } from '../ui/FieldPicker';
import { TextField } from '../ui/TextField';

const STRATEGY_TITLES: Record<string, string> = { keep: 'Keep your rotation', cover: 'Add a cover crop', 'small-grains': 'Bring in small grains', custom: 'Your own plan' };

const KIND_STYLE: Record<PlanTaskKind, string> = {
  plant: 'bg-field-tint text-field border-field/30',
  harvest: 'bg-wheat-tint text-wheat-deep border-wheat/40',
  'cover-plant': 'bg-[#e0f3ef] text-[#1f6f60] border-[#2f9a86]/40',
  'cover-terminate': 'bg-[#e0f3ef] text-[#1f6f60] border-[#2f9a86]/40',
  'soil-test': 'bg-sky-tint text-sky-deep border-sky/30',
  scout: 'bg-alert-tint text-[#7a2c1d] border-alert/30',
  note: 'bg-paper text-ink-soft border-line-strong',
};

type Editing = { kind: 'task'; year: number; task: PlanTask | null; month: number } | { kind: 'season'; year: number } | null;

export function PlannerScreen() {
  const store = useStore();
  const { plans } = useFarm();
  const { field, fields, loaded, select } = useActiveField();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fieldPlans = field ? plans.filter((p) => p.fieldId === field.id) : [];
  const plan = fieldPlans.find((p) => p.id === params.get('plan')) ?? fieldPlans[fieldPlans.length - 1];
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setEditing(null);
    setConfirmDelete(false);
  }, [plan?.id]);

  const save = (next: Plan) => void store.savePlan(next);
  const choosePlan = (id: string) => {
    const q = new URLSearchParams(params.toString());
    q.set('plan', id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <h1 className="font-plate text-3xl">Planner</h1>
          <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">A season-by-season, month-by-month schedule for each field. Every crop, date and task can be changed.</p>
        </header>
        {!loaded ? (
          <p role="status">Loading your fields…</p>
        ) : !field ? (
          <NoFieldsYet what="The Planner" />
        ) : (
          <>
            <FieldPicker fields={fields} field={field} onSelect={select} />
            {!plan ? (
              <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-6" data-testid="no-plan">
                <h2 className="font-plate text-xl">No plan for {field.name} yet</h2>
                <p className="mt-2 text-[16px] text-ink-soft">Compare strategies in Rotation Explorer, open one, and choose “Make this my plan”.</p>
                <Link href={`/rotation?field=${field.id}`} className="mt-4 inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-sky px-5 font-semibold text-white hover:bg-sky-deep">
                  Open Rotation Explorer
                </Link>
              </div>
            ) : (
              <section aria-labelledby="plan-h" className="space-y-4">
                <PlanHeader plan={plan} plans={fieldPlans} onChoose={choosePlan} onRename={(name) => save(renamePlan(plan, name))} />
                <div className="flex flex-wrap gap-2">
                  {plan.strategyId !== 'custom' && (
                    <Link href={`/rotation/${plan.strategyId}?field=${field.id}`} className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line-strong bg-panel px-4 text-[15px] font-semibold hover:border-sky hover:text-sky-deep">
                      Back to strategy
                    </Link>
                  )}
                  <Button variant="secondary" onClick={() => save(addSeason(plan))} disabled={plan.seasons.length >= MAX_PLAN_SEASONS}>
                    Add a year
                  </Button>
                  <Button variant="ghost" onClick={() => save(removeLastSeason(plan))} disabled={plan.seasons.length <= 1}>
                    Remove last year
                  </Button>
                </div>

                <Legend />
                <MonthGrid plan={plan} onMove={(id, year, month) => save(moveTask(plan, id, year, month))} onEditTask={(year, task) => setEditing({ kind: 'task', year, task, month: task.month })} onAddTask={(year, month) => setEditing({ kind: 'task', year, task: null, month })} onEditSeason={(year) => setEditing({ kind: 'season', year })} />
                <SeasonList plan={plan} onEditTask={(year, task) => setEditing({ kind: 'task', year, task, month: task.month })} onAddTask={(year) => setEditing({ kind: 'task', year, task: null, month: 1 })} onEditSeason={(year) => setEditing({ kind: 'season', year })} />

                <div className="pt-2">
                  {confirmDelete ? (
                    <div className="rounded-[var(--radius-panel)] border border-alert/30 bg-alert-tint p-4" role="alertdialog" aria-labelledby="del-plan-h">
                      <p id="del-plan-h" className="text-[15px] text-[#7a2c1d]">
                        Delete <strong>{plan.name}</strong>? This can’t be undone.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button variant="danger" onClick={() => void store.deletePlan(plan.id)}>
                          Delete plan
                        </Button>
                        <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-[var(--radius-control)] px-2 font-semibold text-alert hover:bg-alert-tint">
                      Delete plan
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {plan && editing?.kind === 'task' && (
        <TaskDialog
          plan={plan}
          year={editing.year}
          task={editing.task}
          month={editing.month}
          onClose={() => setEditing(null)}
          onSave={(year, values) => {
            save(editing.task ? updateTask(plan, editing.task.id, { ...values, year }) : addTask(plan, year, values));
            setEditing(null);
          }}
          onDelete={editing.task ? () => { save(removeTask(plan, editing.task!.id)); setEditing(null); } : undefined}
        />
      )}
      {plan && editing?.kind === 'season' && (
        <SeasonDialog
          season={plan.seasons.find((s) => s.year === editing.year)!}
          onClose={() => setEditing(null)}
          onSave={(crop, cover) => {
            save(setPlanCover(setPlanCrop(plan, editing.year, crop), editing.year, cover));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PlanHeader({ plan, plans, onChoose, onRename }: { plan: Plan; plans: Plan[]; onChoose: (id: string) => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(plan.name);
  useEffect(() => setName(plan.name), [plan.id, plan.name]);
  const nameId = useId();
  const pickId = useId();
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={nameId} className="sr-only">
          Plan name (edit to rename)
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() ? onRename(name) : setName(plan.name))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className="font-plate -mx-2 w-[calc(100%+1rem)] rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 text-2xl hover:border-line focus:border-sky focus:bg-panel"
        />
        <h2 id="plan-h" className="sr-only">
          {plan.name}
        </h2>
        <p className="text-[14px] text-ink-soft">
          Made from “{STRATEGY_TITLES[plan.strategyId]}”. Last changed {new Date(plan.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}. Saved in this browser.
        </p>
      </div>
      {plans.length > 1 && (
        <div>
          <label htmlFor={pickId} className="block text-[14px] font-semibold text-ink-soft">
            Plans for this field
          </label>
          <select id={pickId} value={plan.id} onChange={(e) => onChoose(e.target.value)} className="mt-1 min-h-12 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[15px]">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-2 text-[13px]" aria-label="Task types">
      {TASK_KINDS.filter((k) => k.kind !== 'cover-terminate').map((k) => (
        <li key={k.kind} className={`rounded-full border px-2 py-0.5 font-semibold ${KIND_STYLE[k.kind]}`}>
          {k.kind === 'cover-plant' ? 'Cover crop' : k.label}
        </li>
      ))}
    </ul>
  );
}

function SeasonCropButton({ season, onEdit }: { season: PlanSeason; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="flex min-h-11 w-full items-start gap-2 rounded-[var(--radius-control)] px-1 text-left hover:bg-sky-tint" aria-label={`${season.year}: ${season.crop ? cropLabel(season.crop) : 'no crop'}${season.cover ? `, then ${season.cover.name}` : ''}. Change crop`}>
      <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[3px] border border-line" style={{ background: cropColor(season.crop) }} aria-hidden />
      <span className="min-w-0">
        <span className="block text-[16px] font-bold">{season.year}</span>
        <span className="block text-[14px] leading-tight">{season.crop ? cropLabel(season.crop) : 'No crop set'}</span>
        {season.cover && <span className="block text-[13px] leading-tight text-[#1f6f60]">+ {season.cover.name}</span>}
        <span className="mt-0.5 block text-[12.5px] font-semibold text-sky-deep">Change</span>
      </span>
    </button>
  );
}

type ChipProps = { task: PlanTask; year: number; onClick?: () => void; dragging?: boolean; ref?: React.Ref<HTMLButtonElement> } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>;

function TaskChip({ task, year, onClick, dragging, className, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      data-testid="plan-task"
      data-month={task.month}
      data-year={year}
      className={`block w-full rounded-md border px-1.5 py-1 text-left text-[12.5px] font-semibold leading-tight ${KIND_STYLE[task.kind]} hover:brightness-95 ${dragging ? 'opacity-40' : ''} ${className ?? ''}`}
      aria-label={`${task.label}, ${MONTH_NAMES[task.month - 1]} ${year}. Edit`}
    >
      {task.label}
    </button>
  );
}

/** Desktop: one row per year, one column per month. Tasks can be dragged to another month or year. */
function MonthGrid({ plan, onMove, onEditTask, onAddTask, onEditSeason }: { plan: Plan; onMove: (taskId: string, year: number, month: number) => void; onEditTask: (year: number, t: PlanTask) => void; onAddTask: (year: number, month: number) => void; onEditSeason: (year: number) => void }) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  const [active, setActive] = useState<{ task: PlanTask; year: number } | null>(null);
  const [announce, setAnnounce] = useState('');

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { task: PlanTask; year: number } | undefined;
    if (data) setActive(data);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const from = e.active.data.current as { task: PlanTask; year: number } | undefined;
    const to = e.over?.data.current as { year: number; month: number } | undefined;
    if (!from || !to || (from.year === to.year && from.task.month === to.month)) return;
    onMove(from.task.id, to.year, to.month);
    setAnnounce(`Moved ${from.task.label} to ${MONTH_NAMES[to.month - 1]} ${to.year}.`);
  };

  return (
    <div className="hidden lg:block" data-testid="plan-grid">
      <p className="mb-2 text-[14px] text-ink-faint">Drag a task to move it to another month or year. Click a task to edit it.</p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel">
          <caption className="sr-only">Month-by-month schedule. Rows are years, columns are months.</caption>
          <thead>
            <tr>
              <th scope="col" className="w-40 border-b border-line px-3 py-2 text-left text-[13px] font-semibold text-ink-soft">
                Season
              </th>
              {MONTH_SHORT.map((m, i) => (
                <th key={m} scope="col" className="border-b border-l border-line px-1 py-2 text-[13px] font-semibold text-ink-soft">
                  <abbr title={MONTH_NAMES[i]} className="no-underline">
                    {m}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.seasons.map((s) => (
              <tr key={s.year}>
                <th scope="row" className="border-b border-line px-2 py-2 align-top font-normal">
                  <SeasonCropButton season={s} onEdit={() => onEditSeason(s.year)} />
                </th>
                {MONTH_SHORT.map((m, i) => (
                  <MonthCell key={m} year={s.year} month={i + 1} dragging={!!active}>
                    {s.tasks
                      .filter((t) => t.month === i + 1)
                      .map((t) => (
                        <DraggableTask key={t.id} task={t} year={s.year} onClick={() => onEditTask(s.year, t)} />
                      ))}
                    <button
                      type="button"
                      onClick={() => onAddTask(s.year, i + 1)}
                      className="mt-auto min-h-8 rounded-md text-[13px] font-semibold text-ink-faint opacity-0 hover:bg-sky-tint hover:text-sky-deep focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label={`Add a task in ${MONTH_NAMES[i]} ${s.year}`}
                    >
                      + Add
                    </button>
                  </MonthCell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <DragOverlay dropAnimation={null}>{active ? <TaskChip task={active.task} year={active.year} className="cursor-grabbing shadow-lg" /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function MonthCell({ year, month, dragging, children }: { year: number; month: number; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${year}-${month}`, data: { year, month } });
  return (
    <td ref={setNodeRef} data-testid="plan-cell" data-year={year} data-month={month} className={`group border-b border-l border-line p-1 align-top transition-colors ${isOver ? 'bg-sky-tint' : dragging ? 'bg-paper/60' : ''}`}>
      <div className="flex min-h-20 flex-col gap-1">{children}</div>
    </td>
  );
}

function DraggableTask({ task, year, onClick }: { task: PlanTask; year: number; onClick: () => void }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: task.id, data: { task, year } });
  return <TaskChip ref={setNodeRef} task={task} year={year} onClick={onClick} dragging={isDragging} className="cursor-grab touch-manipulation" {...listeners} />;
}

/** Phones and tablets: one card per year with the months that have tasks. */
function SeasonList({ plan, onEditTask, onAddTask, onEditSeason }: { plan: Plan; onEditTask: (year: number, t: PlanTask) => void; onAddTask: (year: number) => void; onEditSeason: (year: number) => void }) {
  return (
    <ol className="space-y-3 lg:hidden" data-testid="plan-list">
      {plan.seasons.map((s) => {
        const months = [...new Set(s.tasks.map((t) => t.month))].sort((a, b) => a - b);
        return (
          <li key={s.year} className="rounded-[var(--radius-panel)] border border-line bg-panel p-3">
            <SeasonCropButton season={s} onEdit={() => onEditSeason(s.year)} />
            {months.length === 0 && <p className="mt-2 text-[14.5px] text-ink-faint">No tasks yet.</p>}
            <dl className="mt-2 space-y-2">
              {months.map((m) => (
                <div key={m} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                  <dt className="pt-1 text-[14px] font-semibold text-ink-soft">{MONTH_SHORT[m - 1]}</dt>
                  <dd className="space-y-1">
                    {s.tasks
                      .filter((t) => t.month === m)
                      .map((t) => (
                        <TaskChip key={t.id} task={t} year={s.year} onClick={() => onEditTask(s.year, t)} />
                      ))}
                  </dd>
                </div>
              ))}
            </dl>
            <Button variant="ghost" className="mt-2" onClick={() => onAddTask(s.year)}>
              + Add a task in {s.year}
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink/30 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[var(--radius-panel)] bg-panel p-5 shadow-xl sm:max-w-md sm:rounded-[var(--radius-panel)]">
        <h2 id={titleId} className="font-plate text-xl">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function TaskDialog({ plan, year, task, month, onClose, onSave, onDelete }: { plan: Plan; year: number; task: PlanTask | null; month: number; onClose: () => void; onSave: (year: number, v: { month: number; kind: PlanTaskKind; label: string }) => void; onDelete?: () => void }) {
  const [kind, setKind] = useState<PlanTaskKind>(task?.kind ?? 'note');
  const [label, setLabel] = useState(task?.label ?? '');
  const [m, setM] = useState(month);
  const [y, setY] = useState(year);
  const kindId = useId();
  const monthId = useId();
  const yearId = useId();
  const select = 'mt-1 block min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]';
  return (
    <Dialog title={task ? 'Edit task' : `Add a task in ${y}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(y, { month: m, kind, label: label || TASK_KIND_LABEL[kind] });
        }}
      >
        <div>
          <label htmlFor={kindId} className="block text-[15px] font-semibold">
            Type
          </label>
          <select id={kindId} value={kind} onChange={(e) => setKind(e.target.value as PlanTaskKind)} className={select}>
            {TASK_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <TextField label="What" value={label} maxLength={80} placeholder={`e.g. ${TASK_KIND_LABEL[kind]} corn`} onChange={(e) => setLabel(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={monthId} className="block text-[15px] font-semibold">
              Month
            </label>
            <select id={monthId} value={m} onChange={(e) => setM(Number(e.target.value))} className={select}>
              {MONTH_NAMES.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={yearId} className="block text-[15px] font-semibold">
              Year
            </label>
            <select id={yearId} value={y} onChange={(e) => setY(Number(e.target.value))} className={select}>
              {plan.seasons.map((s) => (
                <option key={s.year} value={s.year}>
                  {s.year}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="submit">{task ? 'Save task' : 'Add task'}</Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {onDelete && (
            <Button variant="ghost" className="ml-auto text-alert hover:bg-alert-tint" onClick={onDelete}>
              Delete task
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

function SeasonDialog({ season, onClose, onSave }: { season: PlanSeason; onClose: () => void; onSave: (crop: CropRef | null, cover: PlanSeason['cover']) => void }) {
  const [crop, setCrop] = useState<CropRef | null>(season.crop);
  const [cover, setCover] = useState(season.cover?.species ?? '');
  const coverId = useId();
  return (
    <Dialog title={`${season.year} season`} onClose={onClose}>
      <div className="space-y-4">
        <CropPicker label={`Cash crop for ${season.year}`} value={crop} onChange={setCrop} />
        <div>
          <label htmlFor={coverId} className="block text-[15px] font-semibold">
            Cover crop after harvest
          </label>
          <select id={coverId} value={cover} onChange={(e) => setCover(e.target.value)} className="mt-1 block min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]">
            <option value="">None</option>
            {COVER_SPECIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {season.cover && !COVER_SPECIES.some((c) => c.id === season.cover!.species) && <option value={season.cover.species}>{season.cover.name}</option>}
          </select>
          <p className="mt-1 text-[13.5px] text-ink-faint">Changing the crop doesn’t move its tasks; edit those in the grid.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              const sp = COVER_SPECIES.find((c) => c.id === cover);
              onSave(crop, cover ? { species: cover, name: sp?.name ?? season.cover?.name ?? cover } : undefined);
            }}
          >
            Save season
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
