import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  PERKS, PERK_MAX, RARITIES, WEAPONS, isBossWave, isPerkId, isWeaponId, parsePerks, ultimatesFor, vi,
  type PerkId, type WeaponId,
} from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

interface Slow {
  wave: string;
  weapon: WeaponId;
  tier: number;
  perks: string;
  offer: PerkId[];
  breakLeft: number;
}

const EMPTY: Slow = { wave: '', weapon: 'FIST', tier: 0, perks: '', offer: [], breakLeft: 0 };

/**
 * Thủ Thành HUD: wave / boss bar, gate HP, weapon (rarity colour), weapon skill levels, rage meter
 * and — between waves — the weapon card pick (keys 1/2/3 or tap).
 */
export function CastleHud({ net }: { net: MatchNetAdapter }) {
  const gate = useRef<HTMLDivElement>(null);
  const boss = useRef<HTMLDivElement>(null);
  const bossBox = useRef<HTMLDivElement>(null);
  const rage = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const [slow, setSlow] = useState<Slow>(EMPTY);
  const sig = useRef('');

  useAnimationFrame(() => {
    const state = net.getState();
    const castle = state?.castle;
    const me = state?.players.get(net.localId);
    if (!castle || !me || !state) return;
    if (gate.current) gate.current.style.transform = `scaleX(${castle.gateMax > 0 ? castle.gate / castle.gateMax : 0})`;
    let dragon: { hp: number; maxHp: number } | null = null;
    castle.monsters.forEach((m) => {
      if (m.kind === 'DRAGON' && m.state !== 'DIE') dragon = { hp: m.hp, maxHp: m.maxHp };
    });
    const d = dragon as { hp: number; maxHp: number } | null;
    if (bossBox.current) bossBox.current.style.display = d ? '' : 'none';
    if (d && boss.current) boss.current.style.transform = `scaleX(${d.hp / (d.maxHp || 1)})`;
    if (rage.current) rage.current.style.transform = `scaleX(${me.rage})`;
    if (score.current) score.current.textContent = `${me.score} ${vi.points}`;
    const waveText = castle.wave === 0
      ? `${vi.castleWave} 1/${castle.waves}`
      : `${isBossWave(castle.wave) ? `${vi.castleBoss} · ` : ''}${vi.castleWave} ${castle.wave}/${castle.waves}`;
    const breakLeft = castle.breakUntil > 0 ? Math.max(0, Math.ceil(castle.breakUntil - state.gameTime)) : 0;
    const weapon: WeaponId = isWeaponId(me.weapon) ? me.weapon : 'FIST';
    const next = `${waveText}|${weapon}|${me.weaponTier}|${me.perks}|${me.perkOffer}|${breakLeft}`;
    if (next === sig.current) return;
    sig.current = next;
    setSlow({ wave: waveText, weapon, tier: me.weaponTier, perks: me.perks, offer: me.perkOffer.split(',').filter(isPerkId), breakLeft });
  });

  // Keys 1/2/3 pick a card (the pointer is usually locked, so clicking the HUD is not possible).
  useEffect(() => {
    if (slow.offer.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      const perk = slow.offer[i];
      if (perk) net.pickPerk(perk);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slow.offer, net]);

  const perks = parsePerks(slow.perks);
  const ults = ultimatesFor(perks, slow.weapon, slow.tier);
  const rarity = RARITIES[slow.tier] ?? RARITIES[0]!;
  const w = WEAPONS[slow.weapon];
  return (
    <>
      <div className="castle-top">
        <div className="hud-chip">{slow.wave} · <span ref={score} /></div>
        <div ref={bossBox} className="boss-bar" style={{ display: 'none' }}>
          <span>{vi.castleDragon}</span>
          <div className="meter"><div ref={boss} className="meter-fill boss-fill" /></div>
        </div>
        {slow.breakLeft > 0 && <div className="hud-chip castle-break">{vi.castleNextWave} {slow.breakLeft}s</div>}
      </div>
      {slow.offer.length > 0 && (
        <div className="perk-pick" role="dialog" aria-label={vi.castlePickPerk}>
          <h3>{vi.castlePickPerk}</h3>
          <div className="perk-cards">
            {slow.offer.map((id, i) => {
              const info = PERKS[id];
              const lv = perks[id] ?? 0;
              const forge = id === 'FORGE';
              const nextTier = RARITIES[Math.min(slow.tier + 1, RARITIES.length - 1)]!;
              return (
                <button key={id} type="button" className="perk-card" style={{ '--perk': info.color } as CSSProperties} onClick={() => net.pickPerk(id)}>
                  <span className="perk-key">{i + 1}</span>
                  <strong>{info.name}</strong>
                  <span className="perk-level">{forge ? `${w.name} → ${nextTier.name}` : `Cấp ${lv} → ${lv + 1}/${PERK_MAX}`}</span>
                  <span className="perk-desc">{info.desc}</span>
                  {info.ult && <span className={`perk-ult ${lv + 1 >= PERK_MAX ? 'is-next' : ''}`}>Cấp {PERK_MAX}: {info.ult.name} — {info.ult.desc}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="game-hud castle-hud">
        <div className="castle-gate">
          <span>{vi.castleGate}</span>
          <div className="meter"><div ref={gate} className="meter-fill gate-fill" /></div>
        </div>
        <div className="castle-weapon" style={{ '--rarity': rarity.color } as CSSProperties}>
          <span className="weapon-name">{vi.castleWeapon}: {w.name}</span>
          {slow.weapon !== 'FIST' && <span className="weapon-rarity">{rarity.name}</span>}
        </div>
        {slow.perks !== '' && (
          <div className="perk-chips">
            {(Object.keys(perks) as PerkId[]).map((id) => (
              <span key={id} className={`perk-chip ${(perks[id] ?? 0) >= PERK_MAX ? 'is-max' : ''}`} style={{ '--perk': PERKS[id].color } as CSSProperties}>
                {PERKS[id].name} {perks[id]}/{PERK_MAX}
              </span>
            ))}
          </div>
        )}
        <div className={`castle-rage ${ults.length === 0 ? 'is-locked' : ''}`} title={ults.length === 0 ? vi.castleUltLocked : undefined}>
          <span>{vi.castleRage}{ults.length > 0 ? `: ${ults.map((u) => PERKS[u].ult?.name).join(' + ')}` : ''}</span>
          <div className="meter"><div ref={rage} className="meter-fill rage-fill" /></div>
        </div>
        <p className="hud-tip">{vi.castleHint}</p>
      </div>
    </>
  );
}
