import {
    ref,
    onValue
} from
"https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";

import {
    database
} from "./auth.js";

// ============================================================
// CONFIGURATION
// ============================================================

const HISTORY_PATH = "history/UL800";
const CURRENT_PATH = "sensors/UL800";
const MAX_POINTS = 12;

// ============================================================
// SAMPLE DATA (Converted from feet to meters)
// ============================================================

const SAMPLE_VALUES = [
    0.98, 0.91, 0.76, 0.64, 0.70, 0.85, 1.07, 0.88, 0.79, 0.73, 0.82
];

// ============================================================
// SVG SETUP
// ============================================================

const svg = document.getElementById("waterchart");
svg.setAttribute("viewBox", "0 0 735 120");
svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

const NS = "http://www.w3.org/2000/svg";
const leftMargin = 20;
const chartLeft = 34 + leftMargin;
const chartRight = 694 + leftMargin;
const chartWidth = chartRight - chartLeft;
const topY = 10;
const bottomY = 106;
const chartHeight = bottomY - topY;

// ============================================================
// CURRENT READING (from real-time sensor)
// ============================================================

let currentReading = null;

// ============================================================
// GET TODAY DATE
// ============================================================

function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// ============================================================
// GET LAST N DATES
// ============================================================

function getLastNDates(n) {
    const dates = [];
    const now = new Date();
    for (let i = n; i >= 1; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${year}-${month}-${day}`);
    }
    return dates;
}

// ============================================================
// PROCESS HISTORY
// ============================================================

function processHistory(data) {
    const dailyData = {};

    Object.entries(data).forEach(([date, readings]) => {
        if (!readings) return;

        const values = [];
        Object.values(readings).forEach(reading => {
            if (!reading || reading.level === undefined) return;
            
            const meters = Number(reading.level);
            if (meters > 0) {
                values.push(meters);
            }
        });

        if (values.length === 0) return;

        const average = values.reduce((sum, v) => sum + v, 0) / values.length;
        dailyData[date] = { average: average };
    });

    return dailyData;
}

// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(dateString) {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ============================================================
// CLEAR SVG
// ============================================================

function clearChart() {
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
}

// ============================================================
// Y-AXIS STEP
// ============================================================

function getYStep(yMax) {
    if (yMax <= 10) return 2;
    if (yMax <= 20) return 5;
    return 10;
}

// ============================================================
// RENDER Y-AXIS
// ============================================================

function renderYAxis(yMax) {
    const step = getYStep(yMax);
    for (let val = 0; val <= yMax; val += step) {
        const ratio = val / yMax;
        const y = bottomY - (chartHeight * ratio);

        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", 30);
        t.setAttribute("y", y + 4);
        t.setAttribute("fill", "var(--blue)");
        t.setAttribute("font-size", "9px");
        t.setAttribute("text-anchor", "end");
        t.textContent = val + " m";

        svg.appendChild(t);
    }
}

// ============================================================
// RENDER CHART
// ============================================================

function renderChart(dailyData, isSample) {
    clearChart();
    const dates = Object.keys(dailyData).sort().slice(-MAX_POINTS);

    // INSUFFICIENT DATA — SHOW SAMPLE + CURRENT READING
    if (dates.length < MAX_POINTS && !isSample) {
        const pastDates = getLastNDates(MAX_POINTS - 1);
        const todayDate = getCurrentDate();
        const sampleData = {};

        pastDates.forEach((date, i) => {
            sampleData[date] = { average: SAMPLE_VALUES[i] };
        });

        if (currentReading !== null) {
            sampleData[todayDate] = { average: currentReading };
        }

        renderChart(sampleData, true);
        return;
    }

    const averages = dates.map(d => dailyData[d].average);
    const maxVal = Math.max(...averages);

    // DYNAMIC Y-AXIS MAX FOR METERS
    const yMax = Math.max(10, Math.ceil(maxVal / 2) * 2);

    renderYAxis(yMax);

    const points = averages.map((val, i) => {
        const x = dates.length === 1 ? 367 : chartLeft + (chartWidth * i) / (dates.length - 1);
        const y = topY + chartHeight * (1 - val / yMax);
        return [x, y];
    });

    const polyline = document.createElementNS(NS, "polyline");
    polyline.setAttribute("points", points.map(p => p.join(",")).join(" "));
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", "var(--blue)");
    polyline.setAttribute("stroke-width", "3");
    polyline.setAttribute("stroke-linejoin", "round");
    svg.appendChild(polyline);

    points.forEach(p => {
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", p[0]);
        circle.setAttribute("cy", p[1]);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", "var(--blue)");
        svg.appendChild(circle);
    });

    dates.forEach((date, i) => {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", points[i][0]);
        t.setAttribute("y", 115);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", "var(--blue)");
        t.setAttribute("font-size", "9px");
        t.textContent = formatDate(date);
        svg.appendChild(t);
    });
}

// ============================================================
// FIREBASE LISTENER — HISTORY
// ============================================================

const historyRef = ref(database, HISTORY_PATH);
onValue(historyRef, snapshot => {
    const data = snapshot.val();
    if (!data) {
        renderChart({});
        return;
    }
    const dailyData = processHistory(data);
    renderChart(dailyData);
});

// ============================================================
// FIREBASE LISTENER — CURRENT SENSOR
// ============================================================

const currentRef = ref(database, CURRENT_PATH);
onValue(currentRef, snapshot => {
    const data = snapshot.val();
    if (!data || data.level === undefined) return;
    
    currentReading = Number(data.level);
    renderChart({});
});