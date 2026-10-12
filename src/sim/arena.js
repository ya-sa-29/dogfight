export function wrapShip(ship, width, height) {
    ship.x = ((ship.x % width) + width) % width;
    ship.y = ((ship.y % height) + height) % height;
}
