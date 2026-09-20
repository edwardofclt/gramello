"use client";

import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { useBarcodeScanner } from '../hooks/use-barcode-scanner';
import { startBarcodeCamera } from '../lib/barcode-camera';
import type { BarcodeScannerProps } from '../lib/barcode';

const button: CSSProperties = { minHeight: 44, border: '1px solid #213b4d', borderRadius: 13, background: '#152f41', color: '#f4f8fb', padding: '10px 16px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' };

export function BarcodeScanner(props: BarcodeScannerProps) {
  const scanner = useBarcodeScanner(props);
  const id = useId();
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: '#f4f8fb', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
    <button type="button" style={{ ...button, alignSelf: 'flex-start', background: 'transparent' }} onClick={props.onBack}>← Search by name</button>
    {scanner.scanning ? <>
      <BarcodeCamera onScan={scanner.find} onError={scanner.cameraError} />
      <p style={{ margin: 0, color: '#8ca1b2', fontSize: 13, lineHeight: 1.5 }}>Center the product barcode in the frame. Hold steady in good light.</p>
      <button type="button" style={button} onClick={scanner.stopCamera}>Enter barcode manually</button>
    </> : <button type="button" style={{ ...button, opacity: scanner.busy ? .5 : 1 }} disabled={scanner.busy} onClick={scanner.rescan}>Scan again</button>}
    {scanner.error && <div role="alert" style={{ padding: 16, borderRadius: 13, background: '#321e26', color: '#ff9b9b', fontSize: 14, lineHeight: 1.5 }}>{scanner.error}</div>}
    <form onSubmit={event => { event.preventDefault(); void scanner.find(scanner.code); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label htmlFor={id} style={{ fontSize: 13, color: '#8ca1b2' }}>Barcode number</label>
      <input id={id} value={scanner.code} onFocus={scanner.stopCamera} onChange={event => scanner.edit(event.target.value)} disabled={scanner.busy}
        inputMode="numeric" autoComplete="off" maxLength={32} placeholder="Enter the numbers below the barcode"
        style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, border: '1px solid #213b4d', background: '#071927', color: '#f4f8fb', borderRadius: 13, padding: 14, fontFamily: 'inherit', fontSize: 16 }} />
      <button type="submit" disabled={scanner.busy || !scanner.code.trim()} style={{ ...button, background: '#6ee7c7', color: '#071927', opacity: scanner.busy || !scanner.code.trim() ? .5 : 1 }}>{scanner.busy ? 'Looking up barcode…' : 'Look up barcode'}</button>
    </form>
    <p role="status" style={{ margin: 0, color: '#8ca1b2', fontSize: 12, lineHeight: 1.5 }}>{scanner.busy ? 'Finding your product in Open Food Facts…' : 'Product details from Open Food Facts. Review the serving size before adding.'}</p>
  </div>;
}

function BarcodeCamera({ onScan, onError }: { onScan: (code: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) return startBarcodeCamera(video.current, onScan, onError);
  }, [onScan, onError]);
  return <div style={{ position: 'relative', width: '100%', height: 210, borderRadius: 16, overflow: 'hidden', background: '#020b11' }}>
    <video ref={video} aria-label="Barcode camera preview" autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    <div aria-hidden="true" style={{ position: 'absolute', inset: '27% 10%', border: '2px solid #6ee7c7', borderRadius: 12, pointerEvents: 'none' }} />
  </div>;
}
