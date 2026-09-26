'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';

type TrendDay = { date: string; calories: number; protein: number; carbs: number; fat: number };

export function TrendDayInspector({ days }: { days: TrendDay[] }) {
  const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return ordered.length ? <DayInspector key={ordered.map(day => day.date).join(',')} days={ordered}/> : null;
}

function DayInspector({ days }: { days: TrendDay[] }) {
  const [index, setIndex] = useState(days.length - 1);
  const active = days[index];
  const select = (next: number) => setIndex(Math.max(0, Math.min(days.length - 1, next)));

  return <div role="group" aria-label="Logged day details" className="trend-day-inspector"
    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, marginTop: 12, borderRadius: 12, background: '#102b3d' }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        select(index + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    }}>
    <Button type="button" variant="ghost" size="icon" style={{ minWidth: 44, minHeight: 44 }} aria-label="Previous day"
      disabled={index === 0} onClick={() => select(index - 1)}><ChevronLeft aria-hidden="true"/></Button>
    <div aria-live="polite" aria-atomic="true" style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <time dateTime={active.date} style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
        {new Date(`${active.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </time>
      <dl style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '4px 12px', margin: '4px 0 0', fontSize: 12, color: '#a7bac8' }}>
        {(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <div key={key} style={{ display: 'flex', gap: 4 }}>
          <dt>{key === 'calories' ? 'Calories' : key.charAt(0).toUpperCase() + key.slice(1)}</dt>
          <dd style={{ margin: 0 }}>{Math.round(active[key]).toLocaleString('en-US')}{key === 'calories' ? ' kcal' : 'g'}</dd>
        </div>)}
      </dl>
    </div>
    <Button type="button" variant="ghost" size="icon" style={{ minWidth: 44, minHeight: 44 }} aria-label="Next day"
      disabled={index === days.length - 1} onClick={() => select(index + 1)}><ChevronRight aria-hidden="true"/></Button>
  </div>;
}
