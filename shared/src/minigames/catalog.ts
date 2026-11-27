export type MinigameId = 'RLGL' | 'GLASS_BRIDGE' | 'OBSTACLE_RACE' | 'FLOOR_COLLAPSE' | 'TOWER_CLIMB' | 'MAZE' | 'PARKOUR';

export const MINIGAME_IDS: readonly MinigameId[] = ['RLGL', 'GLASS_BRIDGE', 'OBSTACLE_RACE', 'FLOOR_COLLAPSE', 'TOWER_CLIMB', 'MAZE', 'PARKOUR'];

export interface MinigameInfo {
  id: MinigameId;
  title: string;
  rules: readonly string[];
  /** Round time limit in seconds (the game may end earlier). */
  timeLimit: number;
  /** Players move with the shared character simulation (prediction applies). */
  movement: boolean;
  /** Only playable with an even number of players (teams). */
  needsEvenPlayers: boolean;
}

export const MINIGAMES: Readonly<Record<MinigameId, MinigameInfo>> = {
  RLGL: {
    id: 'RLGL',
    title: 'Đèn Xanh – Đèn Đỏ',
    rules: [
      'Đèn xanh: chạy về vạch đích (WASD / mũi tên).',
      'Đèn đỏ: đứng yên! Còn di chuyển sẽ bị loại.',
      'Theo dõi thanh "bài hát" để đoán lúc đèn đổi màu.',
      'Về đích trước khi hết giờ để qua vòng.',
    ],
    timeLimit: 90,
    movement: true,
    needsEvenPlayers: false,
  },
  GLASS_BRIDGE: {
    id: 'GLASS_BRIDGE',
    title: 'Cầu Kính',
    rules: [
      'Mỗi hàng có 3 tấm kính: 2 an toàn, 1 sẽ vỡ.',
      'Click tấm kính ở hàng kế tiếp (hoặc A / S / D) để nhảy.',
      'Tất cả chơi cùng lúc — chờ người khác thử thì an toàn hơn, nhưng coi chừng hết giờ.',
      'Rơi xuống hoặc không qua cầu kịp giờ sẽ bị loại.',
    ],
    timeLimit: 80,
    movement: false,
    needsEvenPlayers: false,
  },
  OBSTACLE_RACE: {
    id: 'OBSTACLE_RACE',
    title: 'Vượt Chướng Ngại',
    rules: [
      'Chạy tới vạch đích, né thanh quét và khối đẩy.',
      'Nhảy qua hố và tường thấp (Space).',
      'Rơi xuống sẽ quay lại checkpoint.',
      'Người về đích chậm nhất hoặc không kịp giờ sẽ bị loại.',
    ],
    timeLimit: 150,
    movement: true,
    needsEvenPlayers: false,
  },
  FLOOR_COLLAPSE: {
    id: 'FLOOR_COLLAPSE',
    title: 'Sàn Sụp',
    rules: [
      'Ô gạch bạn đứng lên sẽ rung rồi rơi sau chưa tới 1 giây — đừng đứng yên!',
      'Rơi khỏi tầng trên thì xuống tầng dưới. Có 3 tầng.',
      'Rơi khỏi tầng cuối cùng là thua.',
      'Còn đứng khi hết giờ (hoặc là người cuối cùng) để qua vòng.',
    ],
    timeLimit: 100,
    movement: true,
    needsEvenPlayers: false,
  },
  TOWER_CLIMB: {
    id: 'TOWER_CLIMB',
    title: 'Tháp Leo',
    rules: [
      'Nhảy (Space) từ bục này sang bục kia để leo lên đỉnh tháp.',
      'Dung nham dâng lên từ dưới, càng lúc càng nhanh — chạm vào là thua.',
      'Bục vàng trượt qua lại, bục tím lúc có lúc không.',
      'Lên tới bục đỉnh để qua vòng.',
    ],
    timeLimit: 110,
    movement: true,
    needsEvenPlayers: false,
  },
  MAZE: {
    id: 'MAZE',
    title: 'Mê Cung',
    rules: [
      'Tìm đường ra cửa xanh ở phía bên kia mê cung.',
      'Sau 5 giây, Minotaur được thả ra và đuổi theo người gần nhất — càng lúc càng nhanh.',
      'Bị Minotaur chạm vào là thua. Mê cung có nhiều lối vòng để cắt đuôi.',
      'Ra khỏi mê cung để qua vòng.',
    ],
    timeLimit: 120,
    movement: true,
    needsEvenPlayers: false,
  },
  PARKOUR: {
    id: 'PARKOUR',
    title: 'Parkour',
    rules: [
      'Vượt đá nhảy, rào chắn, cầu thăng bằng, bệ bật, búa trượt, băng chuyền, thanh quét và bục di động.',
      'Space để nhảy. Bệ bật màu xanh sẽ hất bạn lên tầng cao.',
      'Rơi xuống sẽ quay lại checkpoint gần nhất.',
      'Về đích chậm nhất hoặc không kịp giờ sẽ bị loại.',
    ],
    timeLimit: 150,
    movement: true,
    needsEvenPlayers: false,
  },
};
