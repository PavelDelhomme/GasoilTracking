import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type AccountDrawerContextType = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const AccountDrawerContext = createContext<AccountDrawerContextType | null>(null);

export function AccountDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((v) => !v), []);
  const value = useMemo(
    () => ({ open, openDrawer, closeDrawer, toggleDrawer }),
    [open, openDrawer, closeDrawer, toggleDrawer]
  );
  return (
    <AccountDrawerContext.Provider value={value}>{children}</AccountDrawerContext.Provider>
  );
}

export function useAccountDrawer() {
  const ctx = useContext(AccountDrawerContext);
  if (!ctx) throw new Error('useAccountDrawer hors AccountDrawerProvider');
  return ctx;
}
