export interface ModalStackEntry {
  id: string;
  title: string;
  priority: number;
  order: number;
}

export function upsertModalEntry<T extends ModalStackEntry>(
  stack: readonly T[],
  entry: T
): T[] {
  const existingIdx = stack.findIndex((item) => item.id === entry.id);
  if (existingIdx >= 0) {
    const next = [...stack];
    next[existingIdx] = {
      ...entry,
      order: next[existingIdx].order
    };
    return next;
  }
  return [...stack, entry];
}

export function removeModalEntry<T extends ModalStackEntry>(
  stack: readonly T[],
  id: string
): T[] {
  if (stack.length === 0) return [];
  const next = stack.filter((item) => item.id !== id);
  return next.length === stack.length ? [...stack] : next;
}

export function getTopmostModalEntry<T extends ModalStackEntry>(
  stack: readonly T[]
): T | null {
  if (!Array.isArray(stack) || stack.length === 0) return null;
  let top = stack[0];
  for (let i = 1; i < stack.length; i++) {
    const candidate = stack[i];
    if (
      candidate.priority > top.priority ||
      (candidate.priority === top.priority && candidate.order > top.order)
    ) {
      top = candidate;
    }
  }
  return top;
}
