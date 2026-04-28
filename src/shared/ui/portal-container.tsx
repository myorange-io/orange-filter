import * as React from 'react';

// content script에서 Shadow DOM 안에 Radix Portal을 가두기 위한 context.
// sidepanel/offscreen에서는 provider 없이 렌더 → null → Radix가 document.body로 fallback.
const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  );
}

export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext);
}
