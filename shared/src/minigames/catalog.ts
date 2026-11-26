export type MinigameId = 'RLGL' | 'GLASS_BRIDGE' | 'OBSTACLE_RACE' | 'TUG_OF_WAR' | 'QUICK_REACTION';

export const MINIGAME_IDS: readonly MinigameId[] = ['RLGL', 'GLASS_BRIDGE', 'OBSTACLE_RACE', 'TUG_OF_WAR', 'QUICK_REACTION'];

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
      'Đèn xanh: chạy về vạch đích.',
      'Đèn đỏ: đứng yên! Còn di chuyển sẽ bị loại.',
      'Theo dõi thanh "bài hát" để đoán lúc đèn đổi màu.',
      'Về đích trước khi hết giờ để qua vòng.',
    ],
    timeLimit: 60,
    movement: true,
    needsEvenPlayers: false,
  },
  GLASS_BRIDGE: {
    id: 'GLASS_BRIDGE',
    title: 'Cầu Kính',
    rules: [
      'Mỗi hàng có 2 tấm kính: 1 an toàn, 1 sẽ vỡ.',
      'Click tấm kính ở hàng kế tiếp (hoặc A / D) để nhảy.',
      'Tất cả chơi cùng lúc — chờ người khác thử thì an toàn hơn, nhưng coi chừng hết giờ.',
      'Rơi xuống hoặc không qua cầu kịp giờ sẽ bị loại.',
    ],
    timeLimit: 45,
    movement: false,
    needsEvenPlayers: false,
  },
  OBSTACLE_RACE: {
    id: 'OBSTACLE_RACE',
    title: 'Vượt Chướng Ngại',
    rules: [
      'Chạy tới vạch đích, né thanh quét và khối đẩy.',
      'Nhảy qua hố và tường thấp (Space / chuột giữa).',
      'Rơi xuống sẽ quay lại checkpoint.',
      'Người về đích chậm nhất hoặc không kịp giờ sẽ bị loại.',
    ],
    timeLimit: 90,
    movement: true,
    needsEvenPlayers: false,
  },
  TUG_OF_WAR: {
    id: 'TUG_OF_WAR',
    title: 'Kéo Co',
    rules: [
      'Hai đội kéo dây về phía mình.',
      'Click (hoặc Space) khi kim chạy vào vùng xanh để kéo mạnh.',
      'Bấm lệch nhịp chỉ kéo yếu và bị mệt một chút.',
      'Đội thua sẽ bị loại.',
    ],
    timeLimit: 30,
    movement: false,
    needsEvenPlayers: true,
  },
  QUICK_REACTION: {
    id: 'QUICK_REACTION',
    title: 'Phản Xạ Nhanh',
    rules: [
      'Chờ đèn chuyển sang GO!',
      'Click (hoặc Space) thật nhanh khi thấy GO.',
      'Bấm trước GO bị tính 2000ms cho lượt đó.',
      '3 lượt — tổng thời gian chậm nhất bị loại.',
    ],
    timeLimit: 30,
    movement: false,
    needsEvenPlayers: false,
  },
};
