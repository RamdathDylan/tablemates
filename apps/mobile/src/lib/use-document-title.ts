import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Sets the browser tab title on web ("Friends · TableMates"). No-op on native. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !title) return;
    document.title = `${title} · TableMates`;
  }, [title]);
}
