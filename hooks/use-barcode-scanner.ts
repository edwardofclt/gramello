import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeBarcode, type BarcodeScannerProps } from '../lib/barcode';

export function useBarcodeScanner({ lookup, onFound }: BarcodeScannerProps) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const completed = useRef(false);

  useEffect(() => () => { pending.current?.abort(); }, []);

  const find = useCallback(async (input: string) => {
    if (pending.current || completed.current) return;
    setScanning(false);
    setCode(input);
    setError(null);
    const barcode = normalizeBarcode(input);
    if (!barcode) { setError('Enter an 8, 12, 13, or 14 digit product barcode.'); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const food = await lookup(barcode, controller.signal);
      if (!controller.signal.aborted) { completed.current = true; onFound(food); }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Barcode lookup is unavailable. Try again.');
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); }
    }
  }, [lookup, onFound]);

  const cameraError = useCallback((message: string) => { setScanning(false); setError(message); }, []);
  const edit = (value: string) => { setScanning(false); setCode(value); setError(null); };
  const rescan = () => { setError(null); setScanning(true); };
  return { code, scanning, busy, error, find, edit, rescan, cameraError, stopCamera: () => setScanning(false) };
}
