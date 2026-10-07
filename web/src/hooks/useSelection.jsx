import { createContext, useContext, useState } from 'react';

// The route chosen in "Plan route", read by Safe Walk. Shape: { routeId, label } | null
const Ctx = createContext({ sel: null, setSel: () => {} });

export function SelectionProvider({ children }) {
  const [sel, setSel] = useState(null);
  return <Ctx.Provider value={{ sel, setSel }}>{children}</Ctx.Provider>;
}
export const useSelection = () => useContext(Ctx);
