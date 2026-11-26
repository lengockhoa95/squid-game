import { vi } from '@sp/shared';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';

/** Connection banner + transient error toast, rendered above every screen. */
export function StatusLayer() {
  const status = useStore(sessionStore, (s) => s.status);
  const toast = useStore(sessionStore, (s) => s.toast);
  return (
    <>
      {status === 'reconnecting' && <div className="banner" role="status">{vi.reconnecting}</div>}
      {toast && <div className="toast" role="alert">{toast}</div>}
    </>
  );
}
