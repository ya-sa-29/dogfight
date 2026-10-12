export function createCanvas() {
    const canvas = document.querySelector("#game");
    const context = canvas.getContext("2d");

    function resize() {
        const dpr = window.devicePixelRatio || 1;

        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;

        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    window.addEventListener("resize", resize);
    resize();

    return {
        canvas,
        context,
        get width() {
            return window.innerWidth;
        },
        get height() {
            return window.innerHeight;
        },
    };
}
