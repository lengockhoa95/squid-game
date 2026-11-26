# Phase 2 — Multiplayer (Colyseus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tạo phòng / vào phòng bằng room code, lobby (ready, host, trạng thái kết nối), host START → countdown → tối đa 4 người thật di chuyển cùng nhau trong sân thử, server-authoritative, client prediction + interpolation, reconnect.

**Architecture:** Một `MatchRoom` (Colyseus 0.18) giữ `MatchState` (schema v5, định nghĩa trong `shared` để client có kiểu). Server mô phỏng mỗi người chơi bằng `stepCharacter` ở 60Hz từ hàng đợi input (có ngân sách chống speed-hack), patch 20Hz. Client gửi input theo lô (3 bước/lô ≈ 20 msg/s), dự đoán vị trí mình và reconcile khi nhận `lastSeq`; người khác nội suy trễ 100ms.

**Tech:** `@colyseus/core` 0.18 (`onDrop` + `allowReconnection`, `onReconnect`, `onLeave`), `@colyseus/sdk` 0.18 (auto-reconnect, `client.reconnect(token)` sau reload), `@colyseus/testing` 0.18 (`boot(server)`).

## Global Constraints
- Server là nguồn sự thật: client chỉ gửi intent (hướng ≤1, jump), không gửi vị trí.
- Input chỉ được nhận ở phase `PLAYING`; ready chỉ ở `LOBBY`; START chỉ host.
- Tối đa 4 người; phòng `lock()` khi rời LOBBY.
- Room code 5 ký tự từ `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- Không React re-render theo patch vị trí: store lobby chỉ cập nhật khi trường liên quan đổi.
- Không dùng API deprecated (`setPatchRate` → `patchRate`).

## Quyết định
- Phase 2 có phase `LOBBY → STARTING (3s) → PLAYING (sân thử tự do)`; host có thể "Về lobby". Match/round thật ở Phase 4 sẽ thay `PLAYING`.
- NPC lấp chỗ trống: Phase 3. Phase 2 START khi mọi người thật đã Ready (chơi 1 mình được).
- Người rời hẳn trong PLAYING: xoá khỏi phòng (Phase 4 đổi thành bị loại).
- Map sân thử chuyển vào `shared/src/maps/playground.ts` để server dùng chung collider.

## Tasks

### Task 1: shared protocol, schema, map, validation helpers
**Files:** `shared/src/protocol/{constants.ts,messages.ts}`, `shared/src/schema/MatchState.ts`, `shared/src/maps/playground.ts` (chuyển từ client), `shared/src/validation/{roomCode.ts,nickname.ts,moveBatch.ts}` + tests.
- `ROOM_NAME='match'`, `MAX_PLAYERS=4`, `SIM_HZ=60`, `PATCH_MS=50`, `INPUT_BATCH=3`, `RECONNECT_SECONDS=20`, `COUNTDOWN_SECONDS=3`.
- `MSG = { MOVE, READY, START, BACK_TO_LOBBY, ERROR, COUNTDOWN }` (object `as const`).
- `MoveBatch { s: number; i: number[] }` (flat `[dirX, dirZ, jump01]*n`).
- `PlayerState`: id, nickname, slot, color, accessory, isBot, ready, connected, x,y,z,vx,vy,vz,yaw (float32), grounded, lastSeq (uint32), joinOrder.
- `MatchState`: phase, roomCode, hostId, countdown, players (map).
- `generateRoomCode(rng)`, `normalizeRoomCode(input) → string | null`, `sanitizeNickname(raw, fallback)`, `parseMoveBatch(raw) → MoveBatch | null`.

### Task 2: server room
**Files:** `server/src/app.ts` (defineServer), `server/src/index.ts`, `server/src/rooms/MatchRoom.ts`, `server/src/network/RoomCodeRegistry.ts`, `server/src/validation/RateLimiter.ts`, `server/src/players/{PlayerSim.ts,HostManager.ts}`, `server/src/match/spawn.ts`.
- `PlayerSim`: hàng đợi input (cap 12), credit (≤4/tick), bước rỗng khi đói >15 tick, ghi `lastSeq`.
- `RateLimiter` token bucket theo client × loại message; vượt quá → bỏ message, vi phạm nhiều → kick.
- Tests: RateLimiter, PlayerSim (anti speed-hack: gửi 600 input trong 1 tick không đi xa hơn ngân sách), HostManager.

### Task 3: server integration tests (`@colyseus/testing`)
create → code 5 ký tự; join bằng code; người thứ 5 bị từ chối; ready/start guard; START → STARTING → PLAYING, phòng bị lock; move bị bỏ qua ở LOBBY, được xử lý ở PLAYING; host chuyển khi host rời; back to lobby mở lại phòng.

### Task 4: client network + interpolation + reconciliation
**Files:** `client/src/network/{NetworkManager.ts,serverUrl.ts,sessionStore.ts,errors.ts}`, `client/src/player/{RemoteInterpolator.ts,LocalPredictor.ts}` + tests.
- `RemoteInterpolator`: ring buffer 16 snapshot, `sample(renderTime, out)`; tests nội suy/kẹp/góc.
- `LocalPredictor`: lưu input chưa ack, `reconcile(state, server, ackSeq, world)`; test: replay khớp mô phỏng gốc.

### Task 5: client screens + networked scene
**Files:** `client/src/ui/{HomeScreen.tsx (nickname, tạo/vào phòng),LobbyScreen.tsx,MatchScreen.tsx,CountdownOverlay.tsx,ConnectionBanner.tsx}`, `client/src/scenes/arena/NetworkArenaScene.ts`, `client/src/App.tsx`.
- `PlayerController` thêm `lastIntent`, `applyCorrection()` (làm mượt sai lệch).

### Task 6: verify
- `./scripts/check.sh` sạch.
- E2E Playwright (scratchpad): 4 context trình duyệt: tạo phòng, 3 người vào bằng code, ready, start, di chuyển, xác nhận đồng bộ vị trí + screenshot; reload 1 tab → reconnect.
- Cập nhật README (biến `VITE_SERVER_URL`), PROGRESS, `TESTING.md` (hướng dẫn test 4 người).
