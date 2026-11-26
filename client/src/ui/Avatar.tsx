import { SLOT_LOOKS } from '@sp/shared';

export function Avatar({ slot, name }: { slot: number; name: string }) {
  const look = SLOT_LOOKS[slot] ?? SLOT_LOOKS[0]!;
  const color = `#${look.color.toString(16).padStart(6, '0')}`;
  return (
    <div className="avatar" style={{ background: color }} aria-hidden="true">
      <span>{Array.from(name)[0]?.toUpperCase() ?? '?'}</span>
    </div>
  );
}
