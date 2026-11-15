'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import type { Field } from '../domain/types';
import { useFarm, useStore } from './StoreProvider';

/**
 * The field a page works on: `?field=<id>` if it exists, else the field the farmer last worked on,
 * else the first field. Whatever is shown is remembered for next time.
 */
export function useActiveField(): { field: Field | undefined; fields: Field[]; loaded: boolean; select: (id: string) => void } {
  const store = useStore();
  const { fields, settings, loaded } = useFarm();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get('field');
  const field = fields.find((f) => f.id === requested) ?? fields.find((f) => f.id === settings.lastFieldId) ?? fields[0];

  useEffect(() => {
    if (field) void store.rememberField(field.id);
  }, [field, store]);

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      next.set('field', id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      void store.rememberField(id);
    },
    [params, pathname, router, store],
  );

  return { field, fields, loaded, select };
}
