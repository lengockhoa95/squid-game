import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  BOSS_NAMES, COMBO, PERKS, SIDES, SIDE_NAMES, PERK_MAX, PLAYER_HP, RARITIES, WEAPONS, isBoss, isBossWave, isPerkId, isWeaponId, parsePerks, ultimatesFor, vi,
  type MonsterKind, type PerkId, type WeaponId,
} from '@sp/shared';
import { ElementPicker } from '../../elements/ElementHud.tsx';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

interface Slow {
  wave: string;
  weapon: WeaponId;
  tier: number;
  perks: string;
  offer: PerkId[];
  breakLeft: number;
  boss: string;
  downed: boolean;
  downLeft: number;
  /** Where this wave comes from ("Bắc + Đông"). */
  warn: string;
}

const EMPTY: Slow = { wave: '', weapon: 'FIST', tier: 0, perks: '', offer: [], breakLeft: 0, boss: '', downed: false, downLeft: 0, warn: '' };

/**
 * Thủ Thành HUD: wave / boss bar, gate HP, weapon (rarity colour), weapon skill levels, rage meter
 * and — between waves — the weapon card pick (keys 1/2/3 or tap).
 */
export function CastleHud({ net }: { net: MatchNetAdapter }) {
  const gates = useRef<Array<HTMLDivElement | null>>([]);
  const keep = useRef<HTMLDivElement>(null);
  const boss = useRef<HTMLDivElement>(null);
  const bossBox = useRef<HTMLDivElement>(null);
  const rage = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const hp = useRef<HTMLDivElement>(null);
  const hpText = useRef<HTMLSpanElement>(null);
  const revive = useRef<HTMLDivElement>(null);
  const downSince = useRef(0);
  const banner = useRef<HTMLDivElement>(null);
  const combo = useRef<HTMLDivElement>(null);
  const vignette = useRef<HTMLDivElement>(null);
  const bannerText = useRef('');
  const [slow, setSlow] = useState<Slow>(EMPTY);
  const sig = useRef('');

  useAnimationFrame(() => {
    const state = net.getState();
    const castle = state?.castle;
    const me = state?.players.get(net.localId);
    if (!castle || !me || !state) return;
    castle.gates.forEach((g, i) => {
      const el = gates.current[i];
      if (!el) return;
      const ratio = castle.gateMax > 0 ? g / castle.gateMax : 0;
      el.style.setProperty('--hp', String(ratio));
      el.classList.toggle('is-broken', ratio <= 0);
      el.classList.toggle('is-attacked', castle.sides.split(',').includes(String(i)));
    });
    if (keep.current) keep.current.style.transform = `scaleX(${castle.keepMax > 0 ? castle.keep / castle.keepMax : 0})`;
    let found: { hp: number; maxHp: number; kind: string } | null = null;
    castle.monsters.forEach((m) => {
      if (isBoss(m.kind) && m.state !== 'DIE') found = { hp: m.hp, maxHp: m.maxHp, kind: m.kind };
    });
    const d = found as { hp: number; maxHp: number; kind: string } | null;
    const ratio = Math.max(0, Math.min(1, me.hp / PLAYER_HP.max));
    if (hp.current) {
      hp.current.style.transform = `scaleX(${ratio})`;
      hp.current.classList.toggle('is-low', ratio < 0.35);
    }
    if (hpText.current) hpText.current.textContent = `${me.hp}/${PLAYER_HP.max}`;
    if (revive.current) revive.current.style.transform = `scaleX(${me.revive})`;
    if (me.downed && downSince.current === 0) downSince.current = state.gameTime;
    if (!me.downed) downSince.current = 0;
    const downLeft = me.downed ? Math.max(0, Math.ceil(PLAYER_HP.autoReviveSeconds - (state.gameTime - downSince.current))) : 0;
    if (bossBox.current) bossBox.current.style.display = d ? '' : 'none';
    if (d && boss.current) boss.current.style.transform = `scaleX(${d.hp / (d.maxHp || 1)})`;
    if (rage.current) rage.current.style.transform = `scaleX(${me.rage})`;
    // Centre banner (wave start, leader, boss, gate broken, cleared, last stand).
    if (banner.current) {
      const on = state.gameTime < castle.bannerUntil && castle.banner !== '';
      if (castle.banner !== bannerText.current) {
        bannerText.current = castle.banner;
        banner.current.textContent = castle.banner;
        banner.current.classList.remove('pop');
        void banner.current.offsetWidth; // restart the pop animation
        banner.current.classList.add('pop');
      }
      banner.current.style.opacity = on ? String(Math.min(1, (castle.bannerUntil - state.gameTime) * 2)) : '0';
    }
    // Kill combo with shout-outs at milestones.
    if (combo.current) {
      const live = me.combo >= 3 && state.gameTime - me.comboAt <= COMBO.window;
      combo.current.style.opacity = live ? '1' : '0';
      if (live) {
        const shout = me.combo >= 50 ? 'HUYỀN THOẠI!' : me.combo >= 35 ? 'BẤT KHẢ CHIẾN BẠI!' : me.combo >= 20 ? 'HUỶ DIỆT!' : me.combo >= 10 ? 'QUÉT SẠCH!' : me.combo >= 5 ? 'LIÊN HOÀN!' : '';
        const html = `<b>x${me.combo}</b> COMBO${shout ? `<span>${shout}</span>` : ''}`;
        if (combo.current.innerHTML !== html) {
          combo.current.innerHTML = html;
          combo.current.classList.remove('pop');
          void combo.current.offsetWidth;
          combo.current.classList.add('pop');
        }
      }
    }
    vignette.current?.classList.toggle('is-on', castle.lastStand);
    if (score.current) score.current.textContent = `${me.score} ${vi.points}`;
    const waveText = castle.wave === 0
      ? `${vi.castleWave} 1/${castle.waves}`
      : `${isBossWave(castle.wave) ? `${vi.castleBoss} · ` : ''}${vi.castleWave} ${castle.wave}/${castle.waves}`;
    const breakLeft = castle.breakUntil > 0 ? Math.max(0, Math.ceil(castle.breakUntil - state.gameTime)) : 0;
    const weapon: WeaponId = isWeaponId(me.weapon) ? me.weapon : 'FIST';
    const bossName = d ? BOSS_NAMES[d.kind as MonsterKind] ?? vi.castleDragon : '';
    const warn = castle.sides === '' ? '' : castle.sides.split(',').map((i) => SIDE_NAMES[SIDES[Number(i)] ?? 'N']).join(' + ');
    const next = `${waveText}|${weapon}|${me.weaponTier}|${me.perks}|${me.perkOffer}|${breakLeft}|${bossName}|${me.downed}|${downLeft}|${warn}`;
    if (next === sig.current) return;
    sig.current = next;
    setSlow({ wave: waveText, weapon, tier: me.weaponTier, perks: me.perks, offer: me.perkOffer.split(',').filter(isPerkId), breakLeft, boss: bossName, downed: me.downed, downLeft, warn });
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
      <div ref={vignette} className="laststand-vignette" />
      <div ref={banner} className="castle-banner" />
      <div ref={combo} className="castle-combo" />
      <div className="castle-top">
        <div className="hud-chip">{slow.wave} · <span ref={score} /></div>
        <div ref={bossBox} className="boss-bar" style={{ display: 'none' }}>
          <span>{slow.boss}</span>
          <div className="meter"><div ref={boss} className="meter-fill boss-fill" /></div>
        </div>
        {slow.breakLeft > 0 && <div className="hud-chip castle-break">{vi.castleNextWave} {slow.breakLeft}s</div>}
        {slow.warn !== '' && <div className="hud-chip castle-warn">⚠ {vi.castleFrom} {slow.warn}!</div>}
      </div>
      {slow.downed && (
        <div className="castle-down" role="status">
          <strong>{vi.castleDowned}</strong>
          <span>{vi.castleDownedHint} ({slow.downLeft}s)</span>
          <div className="meter"><div ref={revive} className="meter-fill revive-fill" /></div>
        </div>
      )}
      {slow.breakLeft > 0 && slow.wave !== '' && (
        <div className="castle-element-pick">
          <ElementPicker net={net} />
        </div>
      )}
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
        <div className="castle-hp">
          <span>{vi.castleHp} <span ref={hpText} /></span>
          <div className="meter"><div ref={hp} className="meter-fill hp-fill" /></div>
        </div>
        <div className="castle-defense">
          <div className="gate-compass" aria-label={vi.castleGate}>
            {SIDES.map((side, i) => (
              <div key={side} ref={(el) => { gates.current[i] = el; }} className={`gate-pip gate-${side}`} title={`${vi.castleGate} ${SIDE_NAMES[side]}`}>
                <span>{SIDE_NAMES[side][0]}</span>
              </div>
            ))}
            <div className="gate-core" />
          </div>
          <div className="castle-keep">
            <span>{vi.castleKeep}</span>
            <div className="meter"><div ref={keep} className="meter-fill keep-fill" /></div>
          </div>
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
