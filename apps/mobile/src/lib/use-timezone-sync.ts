import { useEffect } from 'react';

import { api } from './api';
import { useAuth, useMe } from './auth';

/** Keeps the account's time zone in step with the device (for plate check and streak timing). */
export function useTimezoneSync() {
  const me = useMe();
  const { setUser } = useAuth();
  useEffect(() => {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (device && device !== me.timezone) {
      api.updateMe({ timezone: device }).then(setUser).catch(() => {});
    }
  }, [me.timezone, setUser]);
}
