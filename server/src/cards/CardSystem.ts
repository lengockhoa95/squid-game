import {
  CARD_IDS, cardLevel, cardMods, drawOffer, formatCards, isCardId, parseCards,
  type CardId, type CardMods,
} from '@sp/shared';
import type { MatchState, PlayerState } from '@sp/shared/schema';

const LIFE_HASTE_SECONDS = 2;
const NEUTRAL = cardMods({});

/**
 * Skill cards: one free card at match start, then a pick-1-of-3 draft after every round (the
 * last-ranked player sees 4). Picking a card you own levels it up (max 3 = awakening). The server
 * owns every card; clients only send which offered card they want.
 */
export class CardSystem {
  private readonly state: MatchState;
  private readonly rng: () => number;
  private readonly cache = new Map<string, CardMods>();

  constructor(state: MatchState, rng: () => number) {
    this.state = state;
    this.rng = rng;
  }

  get enabled(): boolean {
    return this.state.cardsEnabled;
  }

  /** Resolved modifiers for a player's current cards (neutral when the mode is off). */
  mods(p: PlayerState | undefined): CardMods {
    if (!p || !this.enabled || !p.cards) return NEUTRAL;
    let m = this.cache.get(p.cards);
    if (!m) {
      m = cardMods(parseCards(p.cards));
      this.cache.set(p.cards, m);
    }
    return m;
  }

  /** New match: wipe cards, everyone gets one random card. */
  beginMatch(players: Iterable<PlayerState>): void {
    for (const p of players) {
      p.cards = '';
      p.cardOffer = '';
      p.lives = 0;
      if (this.enabled) this.addCard(p, CARD_IDS[Math.floor(this.rng() * CARD_IDS.length)]!);
    }
  }

  /** Round start: refill lives; unpicked offers are resolved at random. */
  beginRound(players: Iterable<PlayerState>): void {
    for (const p of players) {
      this.resolveOffer(p);
      p.lives = this.mods(p).lives;
    }
  }

  /**
   * After a round with more rounds to come: offer cards to everyone still in the match.
   * `ranking` is best first; the last-ranked player gets an extra option. Bots pick right away.
   * Returns true when offers were made.
   */
  offer(players: readonly PlayerState[], ranking: readonly string[]): boolean {
    if (!this.enabled || players.length === 0) return false;
    const ranked = ranking.filter((id) => players.some((p) => p.id === id));
    const last = ranked[ranked.length - 1];
    for (const p of players) {
      const options = drawOffer(parseCards(p.cards), p.id === last && ranked.length > 1 ? 4 : 3, this.rng);
      p.cardOffer = options.join(',');
      if (p.isBot) this.botPick(p, options);
    }
    return players.some((p) => p.cardOffer !== '');
  }

  pick(p: PlayerState | undefined, card: CardId): boolean {
    if (!p || this.state.phase !== 'ROUND_RESULT' || !p.cardOffer) return false;
    if (!p.cardOffer.split(',').includes(card)) return false;
    this.addCard(p, card);
    p.cardOffer = '';
    return true;
  }

  /** Spend a life to cancel a failure (caught / fell). Level 3 also grants a short speed boost. */
  tryRescue(p: PlayerState | undefined, gameTime: number): boolean {
    if (!p || !this.enabled || p.lives <= 0) return false;
    p.lives -= 1;
    if (this.mods(p).lifeHaste) p.hasteUntil = Math.max(p.hasteUntil, gameTime + LIFE_HASTE_SECONDS);
    return true;
  }

  /** Back to the lobby: no cards outside a match. */
  reset(players: Iterable<PlayerState>): void {
    for (const p of players) {
      p.cards = '';
      p.cardOffer = '';
      p.lives = 0;
    }
  }

  private resolveOffer(p: PlayerState): void {
    if (!p.cardOffer) return;
    const options = p.cardOffer.split(',').filter(isCardId);
    if (options.length > 0) this.addCard(p, options[Math.floor(this.rng() * options.length)]!);
    p.cardOffer = '';
  }

  private botPick(p: PlayerState, options: readonly CardId[]): void {
    const levels = parseCards(p.cards);
    const upgrades = options.filter((id) => cardLevel(levels, id) > 0);
    const choice = upgrades.length > 0 && this.rng() < 0.6
      ? upgrades[Math.floor(this.rng() * upgrades.length)]!
      : options[Math.floor(this.rng() * options.length)];
    if (choice) this.pick(p, choice);
  }

  private addCard(p: PlayerState, card: CardId): void {
    const levels = parseCards(p.cards);
    levels[card] = Math.min(3, cardLevel(levels, card) + 1);
    p.cards = formatCards(levels);
  }
}
