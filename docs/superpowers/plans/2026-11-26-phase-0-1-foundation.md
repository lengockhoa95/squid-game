# Phase 0–1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo chạy được (local + Docker), scene 3D playground với nhân vật điều khiển bằng click-to-move + bàn phím, camera third-person, preset chất lượng, debug overlay đo FPS/draw calls.

**Architecture:** npm workspaces `shared` / `server` / `client`. `shared/sim` chứa kinematics tất định (sẽ dùng chung server + client prediction ở Phase 2). Client: `GameEngine` (TS thuần) điều phối RenderManager / SceneManager / CameraManager / InputManager; React chỉ vẽ menu + overlay, đọc `UIStore` throttled.

**Tech Stack:** TypeScript 7.0.2, Node 24 (chạy `.ts` trực tiếp bằng type stripping), Vite 8, React 19, three 0.187, @colyseus/core 0.18 + @colyseus/schema 5 (builder `t.*`), Vitest 5, Docker + Compose v2.

## Global Constraints

- Không React Three Fiber, không thư viện state ngoài, không physics engine ở phase này.
- `erasableSyntaxOnly`: không `enum`, không parameter properties, không namespace (Node type stripping).
- Import tương đối dùng đuôi `.ts`.
- Schema khai báo bằng `schema({ field: t.xxx() })`, không decorator.
- Client SDK: `@colyseus/sdk` (không `colyseus.js`).
- Không cấp phát object trong render loop; geometry/material dùng chung; mọi scene có `dispose()`.
- Điều khiển: chuột là chính, bàn phím luôn hoạt động song song.
- UI text tiếng Việt trong `shared/src/config/i18n/vi.ts`.

## Kết quả spike Phase 0 (đã xác minh 2026-11-26)

- `tsc` 7.0.2 typecheck sạch với `@colyseus/core` 0.18.30 + schema 5.0.51.
- `schema()` bắt buộc dùng builder `t.string()`, `t.uint32()`… (chuỗi `'string'` bị từ chối lúc runtime).
- `node server/src/x.ts` chạy trực tiếp, import `@sp/shared` (workspace symlink → `shared/src/index.ts`) OK.
- Server API: `defineServer({ transport: new WebSocketTransport(), rooms: { name: defineRoom(RoomClass) } })`, `server.listen(port)`; `this.roomId` gán được trong `onCreate`.

---

### Task 1: Monorepo, tooling, server bootstrap

**Files:** `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `shared/{package.json,tsconfig.json,src/index.ts}`, `server/{package.json,tsconfig.json,src/index.ts,src/config.ts}`, `client/{package.json,tsconfig.json,vite.config.ts,index.html}`

- [ ] Workspaces + scripts root: `build`, `typecheck`, `test`, `dev:client`, `dev:server`.
- [ ] `server/src/index.ts`: `defineServer` lắng nghe `PORT` (mặc định 2567); chưa có room (Phase 2).
- [ ] Verify: `npm run typecheck`, `node server/src/index.ts` in "listening".
- [ ] Commit.

### Task 2: shared config + seeded RNG

**Files:** `shared/src/config/{quality.ts,movement.ts,i18n/vi.ts}`, `shared/src/sim/rng.ts`, test `shared/src/sim/rng.test.ts`

**Produces:**
- `type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH'`; `interface QualityPreset { pixelRatioMax: number; antialias: boolean; shadows: boolean; shadowMapSize: number; fpsCap: 30 | 60 }`; `QUALITY_PRESETS: Record<QualityLevel, QualityPreset>`.
- `MOVEMENT` const: `walkSpeed 6, accel 50, decel 40, airControl 0.4, gravity 28, jumpVelocity 9, radius 0.45, stepHeight 0.35, arriveRadius 0.2`.
- `createRng(seed: number): () => number` (mulberry32, [0,1)).
- Tests: cùng seed → cùng dãy; khác seed → khác; giá trị trong [0,1).

### Task 3: shared kinematics (TDD)

**Files:** `shared/src/sim/{kinematics.ts,clickMove.ts}`, tests `kinematics.test.ts`, `clickMove.test.ts`

**Produces:**
```ts
interface CharacterState { x; y; z; vx; vy; vz; yaw; grounded: boolean }
interface MoveIntent { dirX: number; dirZ: number; jump: boolean }
interface Box { minX; maxX; minZ; maxZ; top: number }
interface SimWorld { bounds: { minX; maxX; minZ; maxZ }; boxes: readonly Box[]; killY: number }
createCharacterState(x, z): CharacterState
stepCharacter(s, intent, dt, world, p = MOVEMENT): void        // mutates, no allocation
intentTowardTarget(s, targetX, targetZ, out: MoveIntent, p = MOVEMENT): boolean // true = arrived
```
Tests: tăng tốc tới walkSpeed, không vượt; dir clamp ‖d‖≤1 (input (5,0) không nhanh hơn (1,0)); dừng khi dir 0; trọng lực + nhảy chỉ khi grounded; không xuyên box (đẩy ra); đứng lên box thấp ≤ stepHeight, bị chặn bởi box cao; clamp trong bounds; yaw quay theo hướng chạy; intentTowardTarget trả arrived khi trong arriveRadius và hướng chuẩn hóa.

### Task 4: Client core (render, scene, materials, store)

**Files:** `client/src/store/UIStore.ts`, `client/src/core/{RenderManager.ts,MaterialLibrary.ts,SceneManager.ts,disposeObject.ts,FrameLimiter.ts}`, tests `FrameLimiter.test.ts`, `UIStore.test.ts`

**Produces:**
- `createStore<T>(initial)` → `{ get(), set(partial), subscribe(fn) }`; `useStore(store, selector)` qua `useSyncExternalStore`.
- `FrameLimiter(fpsCap)`: `shouldRender(nowMs): boolean`, `setCap(cap)`. Tests: cap 30 bỏ frame 60Hz xen kẽ; cap 60 nhận mọi frame 60Hz.
- `RenderManager(canvas)`: `applyQuality(level)`, `setFpsCap`, `start(onFrame(dt))`, `stop()`, `getStats(): RenderStats { fps, drawCalls, triangles, geometries, textures, heapMB | null }`, `dispose()`. Đổi antialias → tạo lại renderer.
- `MaterialLibrary`: `lambert(colorHex)`, `basic(colorHex)` cache theo key, `disposeAll()`.
- `GameScene` interface `{ readonly root: THREE.Scene; update(dt): void; dispose(): void; entityCount(): number }`; `SceneManager.switchTo(loader: () => Promise<GameScene>)` dispose scene cũ trước.

### Task 5: Input + camera (TDD cho phần logic thuần)

**Files:** `client/src/core/{InputManager.ts,inputMath.ts,CameraManager.ts}`, tests `inputMath.test.ts`

**Produces:**
- `classifyRightGesture(dx, dy, durationMs): 'tap' | 'drag'` (drag khi khoảng cách > 5px).
- `keyboardToWorldDir(fwd, right, camYaw, out: {x; z})` (camera-relative, chuẩn hóa).
- `InputManager(canvas)`: trạng thái phím; sự kiện `onGroundClick(ndcX, ndcY)`, `onStop`, `onJump`, `onCameraRotate(dx, dy)`, `onZoom(delta)`, `onToggleDebug`. Chặn context menu trên canvas.
- `CameraManager(camera)`: `yaw`, `pitch` ∈ [10°, 60°], `distance` ∈ [6, 14]; `rotate(dx, dy)`, `zoom(d)`, `update(dt, targetPos, moveYaw | null)` damping mũ, tự xoay về sau lưng khi không xoay tay > 1.5s.
- Tests: tap/drag; W khi camYaw=0 → hướng −Z; W+D chuẩn hóa ‖1‖; camYaw=90° xoay đúng.

### Task 6: Player model, animation, controller

**Files:** `client/src/player/{PlayerModel.ts,AnimationController.ts,PlayerController.ts,ClickMarker.ts}`

**Produces:**
- `PlayerModel(materials, colorHex, accessory: 'none'|'cap'|'glasses'|'band')` → `group`, các bộ phận `body, head, armL, armR, legL, legR`; geometry low-poly dùng chung cấp module.
- `AnimationController(model)`: `update(dt, speed, grounded)` — idle bob, chạy vung tay chân theo tốc độ, tư thế nhảy.
- `PlayerController(world, model)`: giữ `CharacterState`; `setTarget(x,z)`, `clearTarget()`, `requestJump()`, `fixedUpdate(dt, keyboardDir)` (bàn phím ưu tiên, hủy target), `renderUpdate(dt)`. Sim chạy fixed step 1/60 có accumulator.

### Task 7: Playground scene + GameEngine + React UI

**Files:** `client/src/scenes/playground/{PlaygroundScene.ts,playgroundLayout.ts}`, `client/src/core/GameEngine.ts`, `client/src/{main.tsx,App.tsx,styles.css}`, `client/src/ui/{HomeScreen.tsx,DebugOverlay.tsx,SettingsPanel.tsx,ControlsHint.tsx}`

- [ ] Playground (lazy `import()`): sàn, vạch kẻ, hộp chướng ngại (vừa là mesh vừa là `Box` collider), cây/đá `InstancedMesh`, ánh sáng theo quality, nhân vật người chơi + 3 nhân vật demo đi vòng (kiểm tra entity count).
- [ ] `GameEngine`: dựng RenderManager/Input/Camera/SceneManager; raycast click xuống mặt phẳng y=0 (không tạo object mới mỗi click: tái dùng Raycaster/Vector2/Plane); đẩy stats vào UIStore 4Hz; `dispose()` gỡ listener + scene + renderer.
- [ ] React: Home (tên game, nút "Vào sân thử", cài đặt chất lượng/FPS), overlay F3, gợi ý điều khiển. React không render lại mỗi frame.
- [ ] Verify: `npm run build` (tsc + vite build) sạch, `npm test` xanh, dev server chạy.

### Task 8: Docker

**Files:** `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf`, `docker-compose.yml`, `.dockerignore`

- [ ] Server: `node:24-alpine`, `npm ci` chỉ workspace server+shared, `--omit=dev`, `CMD node server/src/index.ts`, expose 2567.
- [ ] Client: multi-stage build (node build → `nginx:alpine` serve `dist`), SPA fallback, cache asset dài hạn; expose 80 → host 8080.
- [ ] `docker compose up --build` → server log "listening", `curl localhost:8080` trả HTML.

### Task 9: Docs + đo hiệu năng

**Files:** `README.md`, `PROGRESS.md`, `docs/perf/phase1-measurements.md`

- [ ] README: cài đặt, chạy local, chạy Docker, điều khiển.
- [ ] PROGRESS: phase đã xong / chưa xong.
- [ ] Bảng đo hiệu năng (draw calls, triangles đo được trong headless; FPS thực tế để người dùng điền trên máy thật).
