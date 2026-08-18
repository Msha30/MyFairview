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

const CURRENT_PATH = "sensors/UL800";
const HISTORY_PATH = "history/UL800";

// ============================================================
// WATER LEVEL THRESHOLDS (METERS)
// ============================================================

const SAFE_LEVEL = 0.91;     // Equivalent to 3.0 ft
const MONITOR_LEVEL = 1.52;  // Equivalent to 5.0 ft
const WARNING_LEVEL = 2.13;  // Equivalent to 7.0 ft

// ============================================================
// ELEMENTS
// ============================================================

const currentElement = document.getElementById("currentWaterLevel");
const highestElement = document.getElementById("highestWaterLevel");
const lowestElement = document.getElementById("lowestWaterLevel");
const historyElement = document.getElementById("waterHistory");

let currentReading = null;
let lastDailyData = null;

// ============================================================
// FORMAT METERS
// ============================================================

function formatMeters(value) {
    if (value === null || value === undefined || isNaN(value)) {
        return "-- m";
    }
    return Number(value).toFixed(2) + " m";
}

// ============================================================
// CURRENT WATER LEVEL
// ============================================================

const currentRef = ref(database, CURRENT_PATH);

onValue(currentRef, snapshot => {
    const data = snapshot.val();

    if (!data) {
        console.log("No current sensor data.");
        if (currentElement) currentElement.textContent = "-- m";
        return;
    }

    const levelMeters = Number(data.level);

    if (currentElement) {
        currentElement.textContent = formatMeters(levelMeters);
    }

    updateCurrentStatus(levelMeters);

    currentReading = {
        average: levelMeters,
        highest: levelMeters,
        lowest: levelMeters,
        date: getTodayDate()
    };

    if (lastDailyData) {
        renderHistory(lastDailyData);
    }

    console.log("Realtime water level:", levelMeters, "m");
});

// ============================================================
// HISTORY
// ============================================================

const historyRef = ref(database, HISTORY_PATH);

onValue(historyRef, snapshot => {
    const data = snapshot.val();

    if (!data) {
        console.log("No history data.");
        if (historyElement) historyElement.innerHTML = "<div>No water level history available.</div>";
        return;
    }

    const dailyData = processHistory(data);
    lastDailyData = dailyData;
    updateTodayStatistics(dailyData);
    renderHistory(dailyData);
});

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
            values.push({
                level: meters,
                timestamp: Number(reading.timestamp)
            });
        });

        if (values.length === 0) return;

        const validValues = values.filter(item => item.level > 0);
        if (validValues.length === 0) return;

        const levels = validValues.map(item => item.level);
        const highest = Math.max(...levels);
        const lowest = Math.min(...levels);
        const average = levels.reduce((sum, value) => sum + value, 0) / levels.length;

        dailyData[date] = {
            average: average,
            highest: highest,
            lowest: lowest,
            readings: validValues
        };
    });

    return dailyData;
}

// ============================================================
// TODAY STATISTICS
// ============================================================

function updateTodayStatistics(dailyData) {
    const today = getTodayDate();
    const todayData = dailyData[today];

    if (!todayData) {
        if (highestElement) highestElement.textContent = "-- m";
        if (lowestElement) lowestElement.textContent = "-- m";
        return;
    }

    if (highestElement) highestElement.textContent = formatMeters(todayData.highest);
    if (lowestElement) lowestElement.textContent = formatMeters(todayData.lowest);
}

// ============================================================
// TODAY DATE
// ============================================================

function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// ============================================================
// RENDER HISTORY
// ============================================================

function renderHistory(dailyData) {
    if (!historyElement) return;
    historyElement.innerHTML = "";

    if (currentReading && !dailyData[currentReading.date]) {
        dailyData[currentReading.date] = {
            average: currentReading.average,
            highest: currentReading.highest,
            lowest: currentReading.lowest,
            readings: []
        };
    }

    const dates = Object.keys(dailyData).sort().reverse().slice(0, 30);

    if (dates.length === 0) {
        historyElement.innerHTML = "<div>No history available.</div>";
        return;
    }

    dates.forEach(date => {
        const data = dailyData[date];
        const status = getStatus(data.average);
        const icon = getStatusIcon(status);
        const formattedDate = formatDate(date);
        const item = document.createElement("div");
        item.className = "level-item";

        item.innerHTML = `
            <div class="history-icon">
                <img src="${icon}" class="svg" alt="${status}">
            </div>
            <div class="content1">
                <div class="status">${status}</div>
                <div class="date">${formattedDate}</div>
            </div>
            <div class="ave">
                <strong>${data.average.toFixed(2)}</strong>
                <span>m</span>
            </div>
            <div class="content2">
                <div class="desc">Highest : ${data.highest.toFixed(2)} m</div>
                <div class="desc">Lowest : ${data.lowest.toFixed(2)} m</div>
            </div>
        `;

        historyElement.appendChild(item);
    });
}

// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(dateString) {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// ============================================================
// STATUS
// ============================================================

function getStatus(level) {
    if (level < SAFE_LEVEL) return "Safe";
    if (level < MONITOR_LEVEL) return "Monitor";
    if (level < WARNING_LEVEL) return "Warning";
    return "Critical";
}

// ============================================================
// STATUS ICON
// ============================================================

function getStatusIcon(status) {
    switch (status) {
        case "Safe": return "../Icons/ic_water_1.svg";
        case "Monitor": return "../Icons/ic_water_2.svg";
        case "Warning": return "../Icons/ic_water_3.svg";
        case "Critical": return "../Icons/ic_water_4.svg";
        default: return "../Icons/ic_water_1.svg";
    }
}

function updateCurrentStatus(level) {
    const status = getStatus(level);
    console.log("Current water status:", status);
}