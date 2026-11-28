export type MinigameId = 'RLGL' | 'GLASS_BRIDGE' | 'OBSTACLE_RACE' | 'FLOOR_COLLAPSE' | 'TOWER_CLIMB' | 'MAZE' | 'PARKOUR' | 'ICE_RACE' | 'LUCKY_DOORS' | 'PAINT' | 'ZOMBIE' | 'ROPE_CLIMB' | 'SHARK_SWIM';

export const MINIGAME_IDS: readonly MinigameId[] = ['RLGL', 'GLASS_BRIDGE', 'OBSTACLE_RACE', 'FLOOR_COLLAPSE', 'TOWER_CLIMB', 'MAZE', 'PARKOUR', 'ICE_RACE', 'LUCKY_DOORS', 'PAINT', 'ZOMBIE', 'ROPE_CLIMB', 'SHARK_SWIM'];

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
      'Mỗi hàng có 3 tấm kính: 2 an toàn, 1 sẽ vỡ khi có người đáp xuống.',
      'Di chuyển WASD, nhảy (Space) sang hàng kế tiếp — giữa các hàng có khe hở.',
      'Tất cả chơi cùng lúc — chờ người khác thử thì an toàn hơn, nhưng coi chừng hết giờ.',
      'Rơi xuống hoặc không qua cầu kịp giờ sẽ bị loại.',
    ],
    timeLimit: 80,
    movement: true,
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
  ICE_RACE: {
    id: 'ICE_RACE',
    title: 'Đua Băng Trơn',
    rules: [
      'Đường đua toàn băng: tăng tốc chậm, phanh không ăn, vào cua rất dễ trượt ra ngoài.',
      'Bắt đầu rẽ sớm trước khúc cua. Cột đá trên đường sẽ làm bạn nảy ra.',
      'Trượt ra ngoài sẽ quay lại điểm gần nhất.',
      'Về đích chậm nhất hoặc không kịp giờ sẽ bị loại.',
    ],
    timeLimit: 120,
    movement: true,
    needsEvenPlayers: false,
  },
  LUCKY_DOORS: {
    id: 'LUCKY_DOORS',
    title: 'Cửa Thần May Mắn',
    rules: [
      'Chạy qua 8 hàng cửa. Mỗi hàng có 4 cửa giống hệt nhau: 2 cửa thật, 2 cửa giả.',
      'Đâm vào cửa giả sẽ bị bật ngược và choáng — cửa đó lộ ra cho mọi người.',
      'Cửa có người đi qua sẽ sáng xanh: theo sau người khác thì an toàn hơn.',
      'Về đích chậm nhất hoặc không kịp giờ sẽ bị loại.',
    ],
    timeLimit: 90,
    movement: true,
    needsEvenPlayers: false,
  },
  PAINT: {
    id: 'PAINT',
    title: 'Sơn Lãnh Thổ',
    rules: [
      'Đi tới đâu, sàn đổi sang màu của bạn tới đó.',
      'Giẫm lên ô của người khác là cướp ô đó.',
      'Hết giờ, ai có ít ô nhất sẽ bị loại.',
      'Nhảy không tô được — chạy liên tục mới phủ nhiều!',
    ],
    timeLimit: 60,
    movement: true,
    needsEvenPlayers: false,
  },
  ZOMBIE: {
    id: 'ZOMBIE',
    title: 'Zombie Lây Lan',
    rules: [
      'Sau 2 giây, một người ngẫu nhiên biến thành zombie.',
      'Zombie chạy nhanh hơn một chút — bị zombie chạm là bạn cũng thành zombie.',
      'Nấp sau thùng, nhảy qua vật cản, dùng nguyên tố để cắt đuôi.',
      'Hết giờ còn là người thì qua vòng; zombie bị loại.',
    ],
    timeLimit: 60,
    movement: true,
    needsEvenPlayers: false,
  },
  ROPE_CLIMB: {
    id: 'ROPE_CLIMB',
    title: 'Leo Dây Nhện',
    rules: [
      'Leo qua 5 cây cầu ván lắc lư để lên bệ cao nhất.',
      'Ván lắc qua lại theo nhịp — canh ván ở giữa rồi bước.',
      'Có gió giật ngang từng đợt: ghì phím ngược chiều gió!',
      'Rơi sẽ quay lại bệ gần nhất. Về chậm nhất hoặc không kịp giờ bị loại.',
    ],
    timeLimit: 120,
    movement: true,
    needsEvenPlayers: false,
  },
  SHARK_SWIM: {
    id: 'SHARK_SWIM',
    title: 'Vượt Biển Cá Mập',
    rules: [
      'Bơi từ bãi biển sang hòn đảo bên kia (dưới nước bơi chậm hơn).',
      'Cá mập tuần tra ngang, thấy bạn ở gần là lao tới đớp — để ý vây trên mặt nước!',
      'Nhảy (và nhảy đôi) để né cú đớp. Bị cá mập đớp là thua.',
      'Lên tới đảo để qua vòng.',
    ],
    timeLimit: 100,
    movement: true,
    needsEvenPlayers: false,
  },
};
