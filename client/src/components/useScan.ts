import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { api } from "@/lib/api";

/** Loads data for the connected wallet and keeps a selection set of item ids. */
export function useScan<T>(path: (owner: string) => string, pick: (data: any) => T[], idOf: (item: T) => string) {
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58();
  const [items, setItems] = useState<T[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<any>(path(owner));
      setItems(pick(data));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  useEffect(() => {
    setItems([]);
    load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(idOf)));

  const removeIds = (ids: string[]) => {
    const gone = new Set(ids);
    setItems((list) => list.filter((i) => !gone.has(idOf(i))));
    setSelected((s) => new Set(Array.from(s).filter((id) => !gone.has(id))));
  };

  return { owner, items, selected, loading, error, load, toggle, toggleAll, allSelected, removeIds };
}
