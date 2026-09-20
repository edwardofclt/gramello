import type { IScannerControls } from '@zxing/browser';
import { normalizeBarcode } from './barcode';

export function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow camera access in your browser settings, or enter the barcode below.';
  if (name === 'NotFoundError') return 'No camera was found. Enter the barcode below.';
  return 'The camera could not start. Close other apps using it, try again, or enter the barcode below.';
}

// Return cleanup immediately, even while the permission prompt is pending.
export function startBarcodeCamera(video: HTMLVideoElement, onScan: (code: string) => void, onError: (message: string) => void) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let controls: IScannerControls | undefined;
  const stop = () => {
    stopped = true;
    controls?.stop();
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  };
  const start = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError('Camera scanning needs a supported browser on HTTPS. You can enter the barcode below.');
        return;
      }
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'), import('@zxing/library'),
      ]);
      if (stopped) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      if (stopped) { stop(); return; }
      const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.ITF]]]), { delayBetweenScanAttempts: 200 });
      controls = await reader.decodeFromStream(stream, video, (result, _error, scanner) => {
        if (stopped || !result) return;
        const code = normalizeBarcode(result.getText());
        if (!code) return;
        scanner.stop();
        stop();
        onScan(code);
      });
      if (stopped) controls.stop();
    } catch (error) {
      if (!stopped) { stop(); onError(cameraErrorMessage(error)); }
    }
  };
  void start();
  return stop;
}
