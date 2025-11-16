import { ReactNode } from 'react';
import '../lib/reownConfig';

interface ReownProviderProps {
  children: ReactNode;
}

export function ReownProvider({ children }: ReownProviderProps) {
  return <>{children}</>;
}
