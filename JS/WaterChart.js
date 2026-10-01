import {
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";

import { 
    getFirestore, 
    collection, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import {
    database,
    app
} from "./auth.js";

// ============================================================
// CONFIGURATION & DEBUG TOGGLE
// ============================================================

const ENABLE_TEST_CYCLE = false; // <-- CHANGE TO TRUE TO DEBUG & CYCLE THROUGH STATUSES AUTOMATICALLY

const firestore = getFirestore(app);
const HISTORY_PATH = "history/UL800";
const CURRENT_PATH = "sensors/UL800";
const MAX_POINTS = 30; // Show the last 30 records (one per date)

// ============================================================
// STATE & THRESHOLDS
// ============================================================

let currentReading = null;
let lastProcessedData = null; 

let thresholds = {
    Safe: { min: 0 },
    Monitor: { min: 0 },
    Warning: { min: 0 },
    Critical: { min: 0 }
};

// Listen for live threshold changes from Firestore
onSnapshot(collection(firestore, "WaterLevel_Threshold"), (snap) => {
    snap.forEach(doc => {
        const data = doc.data();
        if (thresholds[data.status]) {
            thresholds[data.status].min = data.thresholdMin || 0;
        }
    });
    
    if (!ENABLE_TEST_CYCLE) {
        updateCardBackground(currentReading);
    }

    // Thresholds decide the status color, so redraw the graph with the right one
    if (lastProcessedData && typeof renderChart === "function") {
        renderChart(lastProcessedData);
    }
});

// Helper to determine status and color gradients (Original light blue top, status color bottom)
// "line" is the darker shade of the card's background, used for the graph line, dots and labels.
function getStatusInfo(level) {
    if (level === null || level === undefined) {
        return { text: "Safe", color: "var(--green)", line: "var(--green)", gradBottom: "white" };
    }
    if (level >= thresholds.Critical.min) {
        return { text: "Critical", color: "var(--bluedark)", line: "var(--bluedark)", gradBottom: "var(--bluefaded)" };
    }
    if (level >= thresholds.Warning.min) {
        return { text: "Warning", color: "var(--red)", line: "var(--red)", gradBottom: "var(--redfaded)" };
    }
    if (level >= thresholds.Monitor.min) {
        return { text: "Monitor", color: "var(--orange)", line: "var(--orange)", gradBottom: "var(--orangefaded)" };
    }
    return { text: "Safe", color: "var(--green)", line: "var(--green)", gradBottom: "var(--greenfaded)" };
}

// The level the colors follow: the live reading, or — if the sensor is offline — the last level on record
let chartColor = "var(--blue)";

function lastHistoryLevel() {
    if (!lastProcessedData) return null;
    const dates = Object.keys(lastProcessedData).sort();
    return dates.length ? lastProcessedData[dates[dates.length - 1]].average : null;
}

function effectiveLevel(level) {
    if (level !== null && level !== undefined) return level;
    return lastHistoryLevel();
}

// ============================================================
// DEBUG TEST MODE CYCLE (CYCLES EVERY 4 SECONDS IF TRUE)
// ============================================================

if (ENABLE_TEST_CYCLE) {
    let testCycleIndex = 0;
    const testStatuses = ["Safe", "Monitor", "Warning", "Critical"];

    console.warn("WaterChart DEBUG TEST CYCLE is ACTIVE.");

    setInterval(() => {
        const currentTestStatus = testStatuses[testCycleIndex];
        
        let fakeReading = 0;
        if (currentTestStatus === "Critical") fakeReading = thresholds.Critical.min + 0.1;
        else if (currentTestStatus === "Warning") fakeReading = thresholds.Warning.min + 0.1;
        else if (currentTestStatus === "Monitor") fakeReading = thresholds.Monitor.min + 0.1;
        else fakeReading = 0;

        console.log(`Debug Cycling Status -> ${currentTestStatus} (Level: ${fakeReading})`);
        updateCardBackground(fakeReading);
        
        testCycleIndex = (testCycleIndex + 1) % testStatuses.length;
    }, 4000);
}

// ============================================================
// CARD BACKGROUND UPDATER
// ============================================================

function updateCardBackground(level) {
    const waterCard = document.querySelector(".card.water");
    if (!waterCard) return;

    const status = getStatusInfo(effectiveLevel(level));
    
    waterCard.style.transition = "background-image 0.5s ease-in-out";
    
    // Original format: White/Light Blue top fading into status color bottom
    waterCard.style.backgroundImage = `linear-gradient(180deg, #ffffff 0%, ${status.gradBottom} 100%)`;
}

// ============================================================
// TOOLTIP SETUP
// ============================================================

const tooltip = document.createElement("div");
tooltip.style.position = "absolute";
tooltip.style.backgroundColor = "var(--bg, #ffffff)";
tooltip.style.color = "var(--black, #1a1a1a)";
tooltip.style.padding = "8px 12px";
tooltip.style.borderRadius = "8px";
tooltip.style.fontSize = "12px";
tooltip.style.pointerEvents = "none";
tooltip.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
tooltip.style.opacity = "0";
tooltip.style.transition = "opacity 0.2s ease";
tooltip.style.zIndex = "9999";
tooltip.style.fontFamily = "'Inter', sans-serif";
document.body.appendChild(tooltip);

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

        // The latest record of the date (highest timestamp; if none, the last one stored)
        let latest = null;
        let latestTime = -Infinity;

        Object.values(readings).forEach(reading => {
            if (!reading || reading.level === undefined) return;

            const meters = Number(reading.level);
            if (!(meters > 0)) return;

            const time = Number(reading.timestamp);
            const hasTime = Number.isFinite(time);

            if (latest === null || (hasTime && time >= latestTime) || (!hasTime && latestTime === -Infinity)) {
                latest = meters;
                if (hasTime) latestTime = time;
            }
        });

        if (latest === null) return;

        dailyData[date] = { average: latest };
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
        t.setAttribute("fill", chartColor);
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
    chartColor = getStatusInfo(effectiveLevel(currentReading)).line;
    const dates = Object.keys(dailyData).sort().slice(-MAX_POINTS);

    // No records yet: just draw the empty axis
    if (dates.length === 0) {
        renderYAxis(10);
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
    polyline.setAttribute("stroke", chartColor);
    polyline.setAttribute("stroke-width", "3");
    polyline.setAttribute("stroke-linejoin", "round");
    svg.appendChild(polyline);

    // Create the points and attach hover tooltips
    points.forEach((p, i) => {
        const val = averages[i];
        const dateStr = dates[i];
        const status = getStatusInfo(val);

        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", p[0]);
        circle.setAttribute("cy", p[1]);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", chartColor);
        circle.style.cursor = "pointer";
        circle.style.transition = "r 0.2s ease";

        // Show Tooltip
        circle.addEventListener("mouseover", () => {
            circle.setAttribute("r", "7");
            tooltip.style.opacity = "1";
            tooltip.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 4px; font-size: 13px;">${formatDate(dateStr)}</div>
                <div style="color: var(--grey);">Level: <strong style="color: var(--black);">${val.toFixed(2)} m</strong></div>
                <div style="color: var(--grey);">Status: <strong style="color: ${status.color};">${status.text}</strong></div>
            `;
        });

        // Follow Mouse
        circle.addEventListener("mousemove", (e) => {
            tooltip.style.left = (e.pageX + 15) + "px";
            tooltip.style.top = (e.pageY - 35) + "px";
        });

        // Hide Tooltip
        circle.addEventListener("mouseout", () => {
            circle.setAttribute("r", "4");
            tooltip.style.opacity = "0";
        });

        svg.appendChild(circle);
    });

    // With many records, label every few dates so the labels don't overlap (the latest is always labelled)
    const labelStep = dates.length > 12 ? Math.ceil(dates.length / 12) : 1;

    dates.forEach((date, i) => {
        if ((dates.length - 1 - i) % labelStep !== 0) return;
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", points[i][0]);
        t.setAttribute("y", 115);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", chartColor);
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
    lastProcessedData = processHistory(data);
    if (!ENABLE_TEST_CYCLE) updateCardBackground(currentReading);
    renderChart(lastProcessedData);
});

// ============================================================
// FIREBASE LISTENER — CURRENT SENSOR
// ============================================================

const currentRef = ref(database, CURRENT_PATH);
onValue(currentRef, snapshot => {
    const data = snapshot.val();
    
    if (!data || data.level === undefined) {
        currentReading = null;
    } else {
        currentReading = Number(data.level);
    }
    
    if (!ENABLE_TEST_CYCLE) {
        updateCardBackground(currentReading);
    }
    
    if (lastProcessedData) {
        renderChart(lastProcessedData);
    } else {
        renderChart({});
    }
});