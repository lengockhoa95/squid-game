# SURVIVAL PARTY — Design Spec

Ngày: 2026-11-26 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Game web 3D multiplayer, tối đa 4 vị trí/trận (người thật + NPC), 3–5 minigame loại trực tiếp, tìm 1 người thắng. Ưu tiên: vui, dễ hiểu, chạy tốt trên máy yếu, **điều khiển ưu tiên chuột** (bàn phím luôn dùng được song song, không bao giờ bị chặn).

## 2. Công nghệ (phiên bản kiểm tra trên npm ngày 2026-11-26)

| Thành phần | Gói | Phiên bản |
|---|---|---|
| Render | three / @types/three | 0.187.x |
| UI | react, react-dom | 19.x |
| Build | vite | 8.x |
| Ngôn ngữ | typescript | 7.0.x — **chốt ở Phase 0**, fallback 5.x/6.x nếu không tương thích schema v5 |
| Server | @colyseus/core, @colyseus/ws-transport | 0.18.x |
| Sync | @colyseus/schema | 5.x |
| Client SDK | @colyseus/sdk | 0.18.x (KHÔNG dùng `colyseus.js` — dừng ở 0.16) |
| Test | vitest, @colyseus/testing | 5.x / 0.18.x |
| Physics | @dimforge/rapier3d-compat | 0.21.x — **không dùng ở MVP**, chỉ thêm khi thật cần |

Không dùng React Three Fiber, không thư viện state ngoài, không API AI ngoài.

Monorepo npm workspaces: `shared`, `server`, `client`.

## 3. Kiến trúc

- **Server-authoritative**, mô phỏng 20Hz, patch 50ms. Client chỉ gửi *intent*; server tính vị trí, thời gian, điểm, loại.
- **Client**: prediction cho nhân vật mình (dùng chung code `shared/sim` với server) + reconciliation theo `seq`; người khác nội suy với buffer ~100ms.
- **Kinematics tự viết** trong `shared/sim`: capsule vs AABB/OBB, trọng lực, nhảy, vật cản chuyển động theo quỹ đạo tham số hóa theo thời gian server (tất định).
- **React ↔ Engine**: `GameEngine` là class TS ngoài React. `UIStore` (external store + `useSyncExternalStore`) đẩy dữ liệu HUD tối đa 10Hz.
- **Đồng bộ**: Schema cho trạng thái lâu dài (players, phase, minigame state); message cho sự kiện tức thời (đèn đỏ, kính vỡ, GO, loại người chơi).

```
CLIENT: React Screens/HUD ◄ UIStore ◄ GameEngine ─ SceneManager ─ MinigameView (lazy)
        InputManager(mouse+keyboard) ─► NetworkManager(@colyseus/sdk)
                                │ intents ▲ patches/events
SERVER: MatchRoom ─► InputValidator ─► MatchStateMachine ─► RoundScheduler ─► ServerMinigame
                         ▲ cùng Intent API
                     NPCManager ─► NPCBrain(+Profile, Personality, Strategy)
SHARED: types, protocol, config, sim, rng
```

## 4. Cấu trúc thư mục

```
/shared/src
  types/        PlayerInfo, Phase, RoundResult, Difficulty...
  protocol/     message enums, Intent shapes
  config/       difficulty profiles, quality presets, minigame params, i18n vi
  sim/          kinematics, collision, seeded rng
/server/src
  index.ts
  rooms/        MatchRoom.ts, schema/ (MatchState, PlayerState)
  match/        MatchStateMachine.ts, RoundScheduler.ts, EliminationPolicy.ts
  players/      PlayerRegistry.ts, HostManager.ts
  validation/   InputValidator.ts, RateLimiter.ts
  network/      RoomCode.ts
  npc/          NPCManager.ts, NPCBrain.ts, profiles/, personalities/, names.ts
  minigames/
    framework/  ServerMinigame.ts, MinigameContext.ts, registry.ts
    RedLightGreenLight/ GlassBridge/ ObstacleRace/ TugOfWar/ QuickReaction/
      (Logic.ts, State.ts, NPCStrategy.ts, *.test.ts)
/client/src
  core/         GameEngine, SceneManager, CameraManager, AssetManager, RenderManager,
                InputManager, DebugOverlay, MaterialLibrary
  player/       PlayerModel (procedural), AnimationController, LocalPredictor, RemoteInterpolator
  minigames/<Game>/  View.ts, Input.ts, Hud.tsx
  network/      NetworkManager.ts
  store/        UIStore.ts
  ui/  screens/
```

Khác đề xuất gốc: bỏ `/client/src/npc` (NPC chạy hoàn toàn trên server, client vẽ như người chơi + nhãn BOT); thêm `/shared/sim`.

## 5. Multiplayer

- **Room code**: 5 ký tự từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, gán qua `this.roomId` trong `onCreate`, kiểm tra trùng. Client join bằng `joinById(code)`.
- **MatchRoom** duy nhất cho lobby + trận, `maxClients = 4`, `lock()` khi rời LOBBY.
- **Lobby** hiển thị: avatar (màu + phụ kiện), nickname, trạng thái kết nối, ready, Human/NPC, host.
- **Host**: người tạo; rời đi → chuyển cho người thật kế tiếp (theo thứ tự vào). Chỉ host cấu hình NPC (số lượng 0..4−số người thật, độ khó từng NPC) và START.
- **START**: kiểm tra phase=LOBBY, sender=host, mọi người thật Ready → thêm NPC lấp đủ 4 (theo cấu hình) → chốt roster → STARTING (countdown 3s).
- **Reconnect**: `allowReconnection(client, 20)`; token trong `sessionStorage`. Trong thời gian chờ: nhân vật đứng yên, hiện "Mất kết nối". Hết hạn: trong trận → bị loại; trong lobby → xóa slot.
- **Anti-cheat** (`InputValidator`, áp dụng cả NPC): đúng phase, còn sống, chưa về đích; vector hướng clamp ‖v‖≤1; click target trong bounds map; rate limit theo loại message (move 30/s, action 15/s, khác 5/s); `seq` tăng dần; vị trí luôn do server tính (không thể gian lận tốc độ); thời gian đo bằng đồng hồ server; client không bao giờ gửi điểm/kết quả.

## 6. Điều khiển

Nguyên tắc: chuột là chính, bàn phím luôn hoạt động song song. Nhấn phím di chuyển hủy click-target hiện tại; click mới thay thế điều khiển phím khi thả phím.

| Hành động | Chuột | Bàn phím |
|---|---|---|
| Di chuyển | **Click chuột trái lên mặt đất → nhân vật tự đi tới điểm đó** (marker hiển thị) | WASD / mũi tên |
| Dừng ngay | **Nhấp chuột phải** (nhấp nhanh, không kéo) hoặc click lên chính nhân vật | thả hết phím, hoặc X |
| Nhảy (Obstacle Race) | Click chuột giữa | Space |
| Hành động minigame | Click (xem bảng mục 8) | Space |
| Xoay camera | **Giữ chuột phải + kéo** (kéo > 5px mới tính là xoay, không phải dừng) | Q / E |
| Zoom | Con lăn | + / − |

Camera third-person tự xoay mượt về sau lưng hướng di chuyển, giới hạn pitch 10°–60°, khoảng cách 6–14m, lerp làm mượt. Spectator: click trái/ phải để đổi người đang xem.

Đi tới điểm click: đường thẳng, không pathfinding (map thiết kế mở); va chạm do `shared/sim` xử lý (trượt theo tường).

## 7. Match flow

**State machine** (bảng chuyển trạng thái tường minh, chuyển không hợp lệ bị từ chối + log):

```
LOBBY → STARTING → ROUND_INTRO(luật, 5s) → ROUND_COUNTDOWN(3s) → ROUND_PLAYING
      → ROUND_RESULT(6s) → ROUND_INTRO | MATCH_END(10s) → LOBBY
```

- **RoundScheduler**: trận 3–5 vòng (random lúc START), không lặp game liên tiếp, lọc theo số người sống: TugOfWar chỉ khi số sống chẵn (4 → 2v2, 2 → 1v1). Vòng cuối khi còn 2 người.
- **EliminationPolicy** (sau `finish()`):
  - Người không đạt điều kiện → loại.
  - Nếu không ai bị loại → loại người hạng thấp nhất.
  - Nếu tất cả đều bị loại → giữ lại người hạng cao nhất.
  - Đảm bảo số vòng còn lại đủ để về 1 người; nếu đã đủ vòng tối đa mà còn >1 người → vòng cuối là QuickReaction và chỉ người nhanh nhất thắng.
  - Kết thúc khi còn 1 người sống, hoặc không còn người thật nào kết nối (trận hủy, không có winner).
- **Spectator**: người bị loại ở lại phòng, camera theo người còn sống.
- **Disconnect giữa vòng**: nhân vật đứng yên (có thể bị loại theo luật game, ví dụ đèn đỏ thì đứng yên là hợp lệ); hết 20s → loại.

## 8. Minigame framework

```ts
// server
interface ServerMinigame {
  readonly id: MinigameId;
  initialize(ctx: MinigameContext): void; // roster, seed, clock, config
  start(): void;
  handlePlayerInput(playerId: string, intent: Intent): void;
  update(dt: number): void;
  getState(): MinigameStateSchema;
  isFinished(): boolean;
  finish(): RoundResult; // ranking, passed[], failed[] — chỉ server
  dispose(): void;
}
// client
interface MinigameView {
  load(): Promise<void>;          // lazy import + build geometry
  mount(scene: THREE.Scene): void;
  onEvent(e: MinigameEvent): void;
  update(dt: number, state: Readonly<MinigameSnapshot>): void;
  dispose(): void;
  readonly input: MinigameInputMapper; // map chuột/phím → Intent
}
```

Mỗi minigame có: hướng dẫn luật ngắn (ROUND_INTRO), countdown, timer, điều kiện thắng/thua, kết quả, NPCStrategy riêng.

### 8.1 Red Light Green Light
- Đường thẳng 60m, vạch xuất phát/đích, "người giám sát" là robot nguyên bản (đầu xoay).
- Đèn xanh 2–5s, đỏ 2–4s (random seed). Timer 60s.
- Đỏ: sau **grace 250ms** (bù trễ), tốc độ > 0.3 m/s → loại (hiệu ứng bị "bắn" stylized).
- Chuột: click điểm phía trước để chạy, click phải để dừng ngay. Phím: W.
- Qua vòng: chạm đích trước khi hết giờ. Hết giờ chưa về → loại.
- NPC FSM: `Advance → Brake → Hold → Advance`; SMART tăng rủi ro khi còn ít thời gian, dừng sớm hơn khi đèn xanh đã kéo dài.

### 8.2 Glass Bridge (mọi người cùng lúc)
- 8 hàng × 2 tấm kính; đường an toàn tạo từ seed, **chỉ nằm trên server**; client chỉ biết tấm đã vỡ / đã được đứng lên an toàn.
- Tất cả cùng bắt đầu trên bệ. Click tấm trái/phải **ở hàng kế tiếp** (phím A/D) → nhảy (0.6s, cooldown). Không va chạm giữa người chơi (đứng chung tấm được).
- Nhảy vào tấm sai → vỡ, rơi → loại. Tấm đã vỡ: không thể chọn, tấm còn lại được đánh dấu an toàn.
- Timer 45s: hết giờ chưa tới đích → loại. Tạo áp lực giữa "chờ người khác thử" và "kịp giờ".
- NPC: EASY/NORMAL chọn theo xác suất + đôi khi đi theo người trước; HARD chờ tận dụng tấm đã lộ; SMART tính thời gian còn lại/hàng còn lại để quyết định chờ hay liều. NPC không bao giờ đọc đường an toàn.
- Tham số (số hàng, timer) tinh chỉnh qua mô phỏng để trung bình loại 1–2 người.

### 8.3 Obstacle Race
- Đường đua ~80m: thanh quét xoay, cột đẩy qua lại, sàn chuyển động, khe hở cần nhảy. Mọi vật cản là hàm tất định theo thời gian server.
- Rơi khỏi đường → respawn checkpoint gần nhất (mất thời gian), không loại ngay.
- Chuột: click trái để đi tới điểm; click chuột giữa để nhảy; phím WASD + Space.
- Kết quả: xếp hạng theo thời gian về đích; không về đích trong 90s → loại; nếu tất cả về → loại người chậm nhất.
- NPC: đi theo waypoint, SMART/HARD canh pha vật cản trước khi qua; EASY nhảy lệch thời điểm.

### 8.4 Tug of War
- 2v2 (hoặc 1v1). Chia đội: cân bằng theo độ khó NPC, người thật chia đều nếu có thể.
- Thanh nhịp: kim chạy qua lại (chu kỳ tất định từ seed). **Click** (hoặc Space) khi kim trong vùng xanh → lực mạnh; ngoài vùng → lực yếu + mệt ngắn. Server tính nhịp với dung sai ±120ms dựa trên RTT đo được; giới hạn 8 click/s.
- Thanh lực tổng ở giữa; đội bị kéo qua vạch hoặc thua lực khi hết 30s → cả đội bị loại.
- NPC: tỉ lệ trúng vùng xanh theo độ khó; SMART tăng nhịp khi đội đang thua.

### 8.5 Quick Reaction
- 3 lượt. READY → chờ 1.5–5s ngẫu nhiên → GO. **Click bất kỳ** hoặc Space.
- Bấm trước GO → +500ms phạt cho lượt đó. Không bấm trong 1.5s → tính 1500ms.
- Thời gian = (thời điểm server nhận − thời điểm gửi GO) − RTT/2 ước lượng; dưới 100ms bị coi là đoán trước (phạt).
- Kết quả: tổng thời gian; chậm nhất bị loại (vòng cuối: chỉ người nhanh nhất thắng).
- NPC: phản ứng theo phân phối của profile; EASY đôi khi bấm sớm.

## 9. NPC

- NPC = `PlayerState` với `isBot=true`, không có WebSocket. Mỗi tick, `NPCBrain` sinh `Intent` → đi qua **cùng InputValidator** như người thật.
- 3 tầng:
  - `DifficultyProfile`: reactionMs, errorRate, aimNoise, speedFactor(≤1, không vượt giới hạn người chơi), riskTolerance.
  - `Personality`: Cautious / Bold / Follower — điều chỉnh nhẹ profile + seed riêng.
  - `MinigameStrategy` (FSM nhỏ/behavior tree đơn giản mỗi game).

| Độ khó | Phản ứng | Lỗi | Đặc điểm |
|---|---|---|---|
| EASY | 450–700ms | ~15% | chậm, hay sai |
| NORMAL | 300–450ms | ~7% | luật cơ bản |
| HARD | 180–280ms | ~3% | di chuyển tốt, chọn chiến thuật |
| SMART | 180–280ms | ~3% | đọc trạng thái trận (thời gian, ô đã lộ, lực đội), canh thời điểm |

- Chỉ "nghĩ" ở ROUND_PLAYING, quyết định 5–10Hz; bị loại thì dừng.
- Danh tính: bộ tên + màu + phụ kiện (mũ, kính, băng đô) không trùng nhau trong một trận.

## 10. Đồ họa

- Low poly cartoon, flat shading, `MeshLambertMaterial`/`MeshToonMaterial` dùng chung qua `MaterialLibrary`, hầu như không texture (màu vertex/gradient nhỏ).
- Nhân vật procedural ~6 primitive (thân, đầu, 2 tay, 2 chân) + phụ kiện; animation procedural (idle bob, chạy vung tay chân, nhảy, ngã, ăn mừng) — không cần file model.
- Thiết kế nguyên bản, không dùng hình ảnh/nhân vật/asset của Squid Game.
- UI: dark modern arcade, neon vừa phải, card bo góc, animation ngắn (CSS).

## 11. Hiệu năng

- InstancedMesh cho kính, hàng rào, khán giả, trang trí; geometry/material dùng chung.
- Minigame view lazy `import()`; `dispose()` giải phóng geometry/material/texture khi chuyển màn.
- Không cấp phát trong render loop (vector tạm khai báo trước); object pooling cho mảnh kính, hiệu ứng.
- `setAnimationLoop` + giới hạn FPS 30/60.
- Preset:
  - LOW: pixelRatio 0.75, không shadow, không AA, FPS 30.
  - MEDIUM: pixelRatio 1, 1 directional shadow 1024, FPS 60.
  - HIGH: pixelRatio min(dpr,2), AA, shadow 2048, FPS 60.
- Debug overlay (F3): FPS, draw calls, triangles (`renderer.info`), geometries/textures, JS heap (`performance.memory`, Chrome/Edge), số entity.
- Không cam kết số FPS khi chưa đo; Phase 1 tạo bảng đo kết quả trên máy thật.

## 12. Ngôn ngữ

UI tiếng Việt, mọi chuỗi trong `shared/config/i18n/vi.ts` để sau thêm `en.ts`.

## 13. Roadmap

| Phase | Nội dung | Kiểm thử |
|---|---|---|
| 0 | Monorepo, chốt phiên bản, spike TS7 + schema v5 + Colyseus 0.18 | build 3 package |
| 1 | Engine, scene, camera, InputManager (click-to-move + phím), map thử, debug overlay, preset | đo FPS/draw calls LOW vs HIGH |
| 2 | Colyseus room, room code, lobby, ready, host, sync di chuyển (prediction + interpolation) | @colyseus/testing 4 client; 4 cửa sổ trình duyệt |
| 3 | NPC core, 4 độ khó, auto-fill | unit test NPC |
| 4 | Match state machine, scheduler, elimination, spectator, winner | mô phỏng headless 500 trận toàn NPC: luôn kết thúc hợp lệ, không kẹt |
| 5 | Red Light Green Light | unit test luật (fake clock) + chơi 1 người + 3 NPC |
| 6 | Glass Bridge, Obstacle Race, Tug of War, Quick Reaction | unit test + thống kê win-rate theo độ khó |
| 7 | UI polish, âm thanh (WebAudio, file nhỏ), anti-cheat hoàn thiện, reconnect, tối ưu, README/TESTING | checklist 4 người trên Chrome/Edge |

Mỗi phase: `tsc` sạch, build pass, test xanh, cập nhật `PROGRESS.md` trước khi sang phase sau.

## 14. Rủi ro

| Rủi ro | Xử lý |
|---|---|
| TS7 chưa tương thích decorators/schema v5 | spike Phase 0, fallback TS 5.x/6.x hoặc API schema không decorator |
| Tài liệu Colyseus cũ (0.15/0.16) | chỉ theo docs/changelog 0.18 |
| Latency làm RLGL/Reaction không công bằng | grace window, đo RTT, thời gian theo đồng hồ server |
| Prediction lệch → giật | sim dùng chung, smoothing lỗi nhỏ, snap khi lệch lớn |
| Click-to-move khó dừng kịp đèn đỏ | click phải = dừng tức thì, grace 250ms, phím vẫn dùng được |
| Glass Bridge cùng lúc loại quá nhiều người | tinh chỉnh số hàng/timer bằng mô phỏng + EliminationPolicy giữ ≥1 |
| Tab nền bị throttle khi test | test bằng cửa sổ riêng; server authoritative nên logic vẫn đúng |
| WSL2 khó test LAN | hướng dẫn localhost + port forwarding |
| NPC mất cân bằng | tune theo thống kê mô phỏng |

## 15. Nghiệm thu

1–3, 6: integration test 4 client + thử 4 cửa sổ. 4–5: 1 người + 3 NPC qua đủ 5 game. 7–10: mô phỏng headless + chơi thử. 11–12: `renderer.info.memory` không tăng sau 10 lần chuyển màn. 13: checklist Chrome & Edge. 14–15: `README.md`, `TESTING.md`.
