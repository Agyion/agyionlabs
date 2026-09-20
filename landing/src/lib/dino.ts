/* 404 runner — pure game logic, unit-tested. The component only renders
 * state produced here and forwards input events.
 */

export interface DinoState {
  /** player bottom offset above the track, px */
  y: number
  vy: number
  jumping: boolean
  /** obstacle x position (moves right → left); null when none on screen */
  obstacleX: number | null
  score: number
  hiScore: number
  alive: boolean
  /** ms since last obstacle spawn decision */
  sinceSpawn: number
}

export const DINO = {
  gravity: -2400, // px/s², pulls vy back down (y = height above track)
  jumpVelocity: 760, // px/s upward
  speed: 320, // obstacle px/s, grows with score
  playerW: 34,
  playerH: 38,
  obstacleW: 22,
  obstacleH: 40,
  spawnX: 1200, // logical spawn position
  minGapMs: 900,
  maxGapMs: 2200,
} as const

export function initialState(hiScore = 0): DinoState {
  return { y: 0, vy: 0, jumping: false, obstacleX: null, score: 0, hiScore, alive: true, sinceSpawn: 0 }
}

export function jump(s: DinoState): DinoState {
  if (!s.alive || s.jumping) return s
  return { ...s, vy: DINO.jumpVelocity, jumping: true }
}

export function hitPlayer(s: DinoState): boolean {
  if (s.obstacleX === null) return false
  const px = 60 // player x offset inside the scene
  const overlapX = s.obstacleX < px + DINO.playerW && s.obstacleX + DINO.obstacleW > px
  const lowEnough = s.y < DINO.obstacleH
  return overlapX && lowEnough
}

export function speedFor(score: number): number {
  return DINO.speed + Math.min(360, score * 6)
}

export function step(s: DinoState, dtMs: number, rand: () => number = Math.random, fieldW: number = DINO.spawnX): DinoState {
  if (!s.alive) return s
  const dt = dtMs / 1000
  let { y, vy, jumping, obstacleX, score, sinceSpawn } = s

  // vertical physics
  if (jumping) {
    y += vy * dt
    vy += DINO.gravity * dt
    if (y <= 0) {
      y = 0
      vy = 0
      jumping = false
    }
  }

  // obstacle motion
  const v = speedFor(score)
  if (obstacleX !== null) {
    obstacleX -= v * dt
    if (obstacleX < -DINO.obstacleW) {
      obstacleX = null
      score += 1
    }
  }

  // spawn
  sinceSpawn += dtMs
  if (obstacleX === null && sinceSpawn > DINO.minGapMs + rand() * (DINO.maxGapMs - DINO.minGapMs)) {
    obstacleX = fieldW
    sinceSpawn = 0
  }

  const next: DinoState = { ...s, y, vy, jumping, obstacleX, score, sinceSpawn }
  if (hitPlayer(next)) {
    return { ...next, alive: false, hiScore: Math.max(next.hiScore, score) }
  }
  return next
}

export function padScore(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(5, '0')
}
