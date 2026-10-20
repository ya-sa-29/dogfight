export function circlesOverlap(a, b) {
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    const radiusSum = a.radius + b.radius;

    return dx * dx + dy * dy <= radiusSum * radiusSum;
}
