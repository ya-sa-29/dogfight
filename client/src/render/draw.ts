/**
 * Rendering primitives for all entity kinds.
 * All coordinates are world-space; the caller applies the world transform.
 */

interface DrawShipParams {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly thrust: boolean;
}

interface DrawBulletParams {
  readonly pos: { readonly x: number; readonly y: number };
  readonly radius: number;
}

interface DrawMissileParams {
  readonly pos: { readonly x: number; readonly y: number };
  readonly angle: number;
}

interface DrawPickupParams {
  readonly pos: { readonly x: number; readonly y: number };
  readonly radius: number;
}

interface DrawAsteroidParams {
  readonly pos: { readonly x: number; readonly y: number };
  readonly radius: number;
}

interface Particle {
  readonly pos: { readonly x: number; readonly y: number };
  readonly life: number;
  readonly maxLife: number;
}

interface DrawExplosionParams {
  readonly pos: { readonly x: number; readonly y: number };
  readonly particles: readonly Particle[];
}

const GRID_SIZE = 40;
const GRID_COLOR = "rgba(153, 225, 217, 0.08)";
const THRUST_COLOR = "#F1FEC8";
const SHIP_COLOR = "#99E1D9";
const BULLET_COLOR = "#F1FEC8";
const MISSILE_TAIL_COLOR = "#FF7777";
const MISSILE_BODY_COLOR = "#F04444";
const MISSILE_NOSE_COLOR = "#FFD6D6";
const PICKUP_FILL_COLOR = "#F04444";
const PICKUP_STROKE_COLOR = "#FFD6D6";
const ASTEROID_COLOR = "#D6A77A";
const EXPLOSION_COLOR = "#FFD166";

export function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.save();

  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;

  for (let x = 0; x <= width; x += GRID_SIZE) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }

  for (let y = 0; y <= height; y += GRID_SIZE) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

export function drawShip(
  context: CanvasRenderingContext2D,
  ship: DrawShipParams,
): void {
  context.save();

  context.translate(ship.x, ship.y);
  context.rotate(ship.angle);

  if (ship.thrust) {
    context.beginPath();
    context.moveTo(-10, -5);
    context.lineTo(-22, 0);
    context.lineTo(-10, 5);
    context.fillStyle = THRUST_COLOR;
    context.fill();
  }

  context.beginPath();
  context.moveTo(15, 0);
  context.lineTo(-10, -9);
  context.lineTo(-6, 0);
  context.lineTo(-10, 9);
  context.closePath();

  context.fillStyle = SHIP_COLOR;
  context.fill();

  context.restore();
}

export function drawBullet(
  context: CanvasRenderingContext2D,
  bullet: DrawBulletParams,
): void {
  context.save();

  context.beginPath();
  context.arc(bullet.pos.x, bullet.pos.y, bullet.radius, 0, Math.PI * 2);
  context.fillStyle = BULLET_COLOR;
  context.fill();

  context.restore();
}

export function drawMissile(
  context: CanvasRenderingContext2D,
  missile: DrawMissileParams,
): void {
  context.save();

  context.translate(missile.pos.x, missile.pos.y);
  context.rotate(missile.angle);

  // Хвіст ракети
  context.beginPath();
  context.moveTo(-5, -3);
  context.lineTo(-12, 0);
  context.lineTo(-5, 3);
  context.closePath();
  context.fillStyle = MISSILE_TAIL_COLOR;
  context.fill();

  // Корпус ракети
  context.beginPath();
  context.moveTo(7, 0);
  context.lineTo(-4, -3);
  context.lineTo(-4, 3);
  context.closePath();
  context.fillStyle = MISSILE_BODY_COLOR;
  context.fill();

  // Носик
  context.beginPath();
  context.arc(5, 0, 1.5, 0, Math.PI * 2);
  context.fillStyle = MISSILE_NOSE_COLOR;
  context.fill();

  context.restore();
}

export function drawPickup(
  context: CanvasRenderingContext2D,
  pickup: DrawPickupParams,
): void {
  context.save();

  context.translate(pickup.pos.x, pickup.pos.y);

  // Ромб позначає боєзапас ракет
  context.beginPath();
  context.moveTo(0, -pickup.radius);
  context.lineTo(pickup.radius, 0);
  context.lineTo(0, pickup.radius);
  context.lineTo(-pickup.radius, 0);
  context.closePath();

  context.fillStyle = PICKUP_FILL_COLOR;
  context.fill();

  context.strokeStyle = PICKUP_STROKE_COLOR;
  context.lineWidth = 2;
  context.stroke();

  context.restore();
}

export function drawAsteroid(
  context: CanvasRenderingContext2D,
  asteroid: DrawAsteroidParams,
): void {
  context.save();
  context.beginPath();
  context.arc(
    asteroid.pos.x,
    asteroid.pos.y,
    asteroid.radius,
    0,
    Math.PI * 2,
  );
  context.strokeStyle = ASTEROID_COLOR;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

export function drawExplosion(
  context: CanvasRenderingContext2D,
  explosion: DrawExplosionParams,
): void {
  for (const particle of explosion.particles) {
    if (particle.life <= 0) continue;

    const progress = 1 - particle.life / particle.maxLife;
    const alpha = 1 - progress;
    const size = 2 + (1 - progress) * 2;

    const x = explosion.pos.x + particle.pos.x;
    const y = explosion.pos.y + particle.pos.y;

    context.globalAlpha = alpha;
    context.fillStyle = EXPLOSION_COLOR;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
}