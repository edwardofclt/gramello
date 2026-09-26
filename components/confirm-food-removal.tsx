'use client';

import { Loader2 } from 'lucide-react';
import { useRef } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export function ConfirmFoodRemoval({ entry, busy, onCancel, onConfirm, error }: {
  entry: { id: string; name: string } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  error?: string | null;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog open={entry !== null} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <DialogContent className="goal-dialog" showCloseButton={!busy}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); }
      }}
      onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}
      onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Remove food?</DialogTitle>
        <DialogDescription>Remove {entry?.name} from your diary? You can add it again later.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="food-error">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => { if (!busy) onConfirm(); }}>
          {busy && <Loader2 aria-hidden="true" className="spin"/>}{busy ? 'Removing…' : 'Remove food'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
