import { firestore, database } from "./auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";

const SUBDIVISIONS = [
    "No Subdivision",
    "Ciudad Verde",
    "West Fairview Subdivision",
    "East Fairview Park Subdivision",
    "Sunny Villas Condominium",
    "Grand Mesa Residences",
    "Other"
];

let usersData = [];   // { area, status }
let reportsData = []; // { status, createdBy }

// --- Available Barangay Vehicles (Realtime Database) ---
onValue(ref(database, "vehicles"), (snapshot) => {
    const el = document.getElementById("statAvailableVehicles");
    if (!el) return;

    if (!snapshot.exists()) {
        el.textContent = "0 / 0";
        return;
    }

    const vehicles = Object.values(snapshot.val());
    const total = vehicles.length;
    const available = vehicles.filter(v => v.deployed === false).length;
    el.textContent = `${available} / ${total}`;
});

// --- Total Registered Citizens + subdivision breakdown (Firestore) ---
onSnapshot(collection(firestore, "Info_User"), (snapshot) => {
    usersData = snapshot.docs.map(d => ({
        userID: d.data().userID || d.id,
        area: d.data().area || "No Subdivision",
        status: d.data().status || ""
    }));

    const registeredEl = document.getElementById("statRegisteredCitizens");
    if (registeredEl) {
        const verifiedCount = usersData.filter(u => u.status === "Verified").length;
        registeredEl.textContent = verifiedCount.toLocaleString();
    }

    renderSubdivisionTable();
});

// --- Total Unresolved Reports + subdivision breakdown (Firestore) ---
onSnapshot(collection(firestore, "Reports"), (snapshot) => {
    reportsData = snapshot.docs.map(d => ({
        status: d.data().status || "",
        createdBy: d.data().createdBy || ""
    }));

    const unresolvedEl = document.getElementById("statUnresolvedReports");
    if (unresolvedEl) {
        const unresolvedCount = reportsData.filter(r => r.status === "Unresolved").length;
        unresolvedEl.textContent = String(unresolvedCount).padStart(2, "0");
    }

    renderSubdivisionTable();
});

function renderSubdivisionTable() {
    // userID -> area lookup, so Reports (which only store createdBy) can be
    // attributed back to a subdivision.
    const areaByUserID = {};
    usersData.forEach(u => {
        if (u.userID) areaByUserID[u.userID] = u.area;
    });

    SUBDIVISIONS.forEach(sub => {
        const row = document.querySelector(`#subdivisionTableBody tr[data-sub="${sub}"]`);
        if (!row) return;

        const usersInSub = usersData.filter(u => u.area === sub);
        const registered = usersInSub.filter(u => u.status === "Verified").length;
        const unverified = usersInSub.filter(u => u.status === "Unverified").length;
        const invalid = usersInSub.filter(u => u.status === "Invalid").length;

        const reportsInSub = reportsData.filter(r => areaByUserID[r.createdBy] === sub);
        const unresolved = reportsInSub.filter(r => r.status === "Unresolved").length;
        const resolved = reportsInSub.filter(r => r.status === "Resolved").length;

        setField(row, "registered", registered);
        setField(row, "unverified", unverified);
        setField(row, "invalid", invalid);
        setField(row, "unresolved", unresolved);
        setField(row, "resolved", resolved);
    });
}

function setField(row, field, value) {
    const cell = row.querySelector(`[data-field="${field}"]`);
    if (cell) cell.textContent = value.toLocaleString();
}
