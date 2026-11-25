export class Netgraph {
    constructor(canvas, getMetrics) {
        this.canvas = canvas;
        this.getMetrics = getMetrics;
        this.enabled = false;

        // UI constants
        this.padding = 8;
        this.lineHeight = 16;
        this.font = "12px monospace";
        this.bgColor = "rgba(35, 33, 44, 0.85)";
        this.textColor = "#F1FEC8";
        this.labelColor = "#64d8ff";
        this.valueColor = "#F1FEC8";
        this.warnColor = "#ffcc00";
        this.errorColor = "#ff6666";
    }

    toggle() {
        this.enabled = !this.enabled;
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    isEnabled() {
        return this.enabled;
    }

    render() {
        if (!this.enabled) return;

        const ctx = this.canvas.context;
        const metrics = this.getMetrics();

        // Calculate panel dimensions
        const lines = [
            {
                label: "RTT",
                value:
                    metrics.rtt !== null ? `${metrics.rtt.toFixed(1)} ms` : "—",
                color: this.getRttColor(metrics.rtt),
            },
            {
                label: "Snapshot Age",
                value:
                    metrics.snapshotAge !== null
                        ? `${metrics.snapshotAge.toFixed(1)} ms`
                        : "—",
                color: this.valueColor,
            },
            {
                label: "Bytes In/s",
                value: `${metrics.bytesInPerSec} B/s`,
                color: this.valueColor,
            },
            {
                label: "Bytes Out/s",
                value: `${metrics.bytesOutPerSec} B/s`,
                color: this.valueColor,
            },
            {
                label: "Pending Inputs",
                value: `${metrics.pendingInputs}`,
                color: this.getPendingColor(metrics.pendingInputs),
            },
            {
                label: "Correction",
                value:
                    metrics.correction !== null
                        ? `${metrics.correction.toFixed(2)} px`
                        : "—",
                color: this.valueColor,
            },
            {
                label: "Interp Delay",
                value:
                    metrics.interpolationDelay !== null &&
                    metrics.interpolationDelay !== undefined
                        ? `${Math.round(metrics.interpolationDelay)} ms  [ / ]`
                        : "—",
                color: this.valueColor,
            },
        ];

        const maxLabelWidth = Math.max(
            ...lines.map((l) => ctx.measureText(l.label + ": ").width),
        );
        const maxValueWidth = Math.max(
            ...lines.map((l) => ctx.measureText(l.value).width),
        );
        const panelWidth =
            this.padding * 2 + maxLabelWidth + maxValueWidth + 20;
        const panelHeight = this.padding * 2 + lines.length * this.lineHeight;

        // Position in top-right corner, in CSS pixels. The context base
        // transform already applies devicePixelRatio exactly once, and the
        // netgraph is drawn outside the world transform, so CSS viewport
        // coordinates are correct here.
        const x = this.canvas.viewWidth - panelWidth - 10;
        const y = 10;

        // Draw background
        ctx.save();
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(x, y, panelWidth, panelHeight);

        // Draw border
        ctx.strokeStyle = "#454354";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, panelWidth, panelHeight);

        // Draw title
        ctx.font = "bold 12px monospace";
        ctx.fillStyle = this.labelColor;
        ctx.textAlign = "left";
        ctx.fillText("NETGRAPH", x + this.padding, y + this.padding + 12);

        // Draw metrics
        ctx.font = this.font;
        let lineY = y + this.padding + 28;

        for (const line of lines) {
            ctx.fillStyle = this.labelColor;
            ctx.fillText(`${line.label}:`, x + this.padding, lineY);

            ctx.fillStyle = line.color;
            ctx.fillText(
                line.value,
                x + this.padding + maxLabelWidth + 10,
                lineY,
            );

            lineY += this.lineHeight;
        }

        ctx.restore();
    }

    getRttColor(rtt) {
        if (rtt === null) return "#888888";
        if (rtt < 50) return this.valueColor;
        if (rtt < 150) return this.warnColor;
        return this.errorColor;
    }

    getPendingColor(count) {
        if (count === 0) return this.valueColor;
        if (count < 5) return this.warnColor;
        return this.errorColor;
    }
}

export function createNetgraph(canvas, getMetrics) {
    return new Netgraph(canvas, getMetrics);
}
