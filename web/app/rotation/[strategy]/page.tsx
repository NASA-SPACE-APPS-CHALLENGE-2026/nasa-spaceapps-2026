import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { StrategyDetail } from '@/components/rotation/StrategyDetail';
import type { StrategyId } from '@/lib/domain/types';

const TITLES: Record<StrategyId, string> = { keep: 'Keep your rotation', cover: 'Add a cover crop', 'small-grains': 'Bring in small grains' };

export function generateStaticParams() {
  return Object.keys(TITLES).map((strategy) => ({ strategy }));
}

export async function generateMetadata({ params }: { params: Promise<{ strategy: string }> }) {
  const { strategy } = await params;
  return { title: `${TITLES[strategy as StrategyId] ?? 'Strategy'} | Rotation Explorer | FieldShift` };
}

export default async function Page({ params }: { params: Promise<{ strategy: string }> }) {
  const { strategy } = await params;
  if (!(strategy in TITLES)) notFound();
  return (
    <Suspense>
      <StrategyDetail strategyId={strategy as StrategyId} />
    </Suspense>
  );
}
