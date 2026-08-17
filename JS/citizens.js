import { firestore } from "./auth.js"; 
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// 1. Global Array to store users so we don't query Firestore on every keystroke
let allCitizens = [];

// 2. Fetch Citizens Once
async function fetchCitizens() {
    try {
        const querySnapshot = await getDocs(collection(firestore, "Info_User"));
        allCitizens = []; // Reset array
        
        querySnapshot.forEach((docSnap) => {
            allCitizens.push(docSnap.data());
        });

        renderTable(allCitizens); // Draw table with all data initially
    } catch (error) {
        console.error("Error loading citizens table:", error);
    }
}

// 3. Draw the Table
function renderTable(usersData) {
    const tbody = document.querySelector(".tableDiv.citizens tbody");
    if (!tbody) return;

    tbody.innerHTML = ""; // Clear existing rows

    // Show a message if no results match the filter
    if (usersData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No residents match your search.</td></tr>`;
        return;
    }

    usersData.forEach((user) => {
        // Format Name
        const fName = (user.fName || "").trim();
        const lName = (user.lName || "").trim();
        const mName = (user.mName || "").trim();
        const mNameInitial = mName ? `${mName.charAt(0)}.` : "";

        const fullName = (lName && mName)
            ? `${lName}, ${fName} ${mNameInitial}`.trim()
            : [fName, mNameInitial, lName].filter(Boolean).join(" ");

        // Format Avatar Initials
        const fInitial = fName ? fName.charAt(0).toUpperCase() : "";
        const lInitial = lName ? lName.charAt(0).toUpperCase() : "";
        const initials = `${fInitial}${lInitial}`;

        // Format Date of Birth
        let dob = "N/A";
        if (user.birthdate && typeof user.birthdate.toDate === 'function') {
            dob = user.birthdate.toDate().toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric"
            });
        }

        // Format Status
        const statusStr = (user.status || "Unverified").toLowerCase();
        let statusClass = "unverified";
        let badgeText = "◉ Unverified";

        if (statusStr === "verified") {
            statusClass = "verified";
            badgeText = "● Verified";
        } else if (statusStr === "invalid" || statusStr === "rejected") {
            statusClass = "invalid";
            badgeText = "● Invalid";
        }

        const sex = user.sex || "N/A"; 

        const row = `
            <tr class="tableRow" data-uid="${user.uid}">
                <td class="user-section">
                    <div class="user-avatar ${statusClass}">${initials}</div>
                    <div class="user-info">
                        <strong>${fullName}</strong><br>
                        <span>${user.userID || "No ID"}</span>
                    </div>
                </td>
                <td>${user.area || "N/A"}</td>
                <td>${sex}</td>
                <td>${dob}</td>
                <td>${user.contactMain || "N/A"}</td>
                <td><span class="badge ${statusClass}">${badgeText}</span></td>
            </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", row);
    });

    // Re-attach popup click events to the new rows
    const rows = tbody.querySelectorAll(".tableRow");
    rows.forEach(row => {
        row.addEventListener("click", () => {
            const uid = row.getAttribute("data-uid");
            if (typeof window.openInfoCitizens === "function") {
                window.openInfoCitizens(uid); 
            }
        });
    });
}

// 4. Filtering Logic
function filterTable() {
    const searchInput = document.getElementById("search");
    const areaFilter = document.getElementById("areaFilter");
    const statusFilter = document.getElementById("statusFilter");

    // Grab current values from inputs
    const searchTerm = searchInput.value.toLowerCase().trim();
    const areaValue = areaFilter.value.toLowerCase();
    const statusValue = statusFilter.value.toLowerCase();

    // Filter the global array
    const filteredUsers = allCitizens.filter(user => {
        // --- 1. Check Search Term ---
        // Match against first name, last name, or User ID
        const fName = (user.fName || "").toLowerCase();
        const lName = (user.lName || "").toLowerCase();
        const fullName = `${fName} ${lName}`;
        const userID = (user.userID || "").toLowerCase();

        const matchesSearch = fullName.includes(searchTerm) || 
                              lName.includes(searchTerm) || 
                              fName.includes(searchTerm) || 
                              userID.includes(searchTerm);

        // --- 2. Check Area Dropdown ---
        const userArea = (user.area || "").toLowerCase();
        const matchesArea = areaValue === "all" || userArea === areaValue;

        // --- 3. Check Status Dropdown ---
        const userStatus = (user.status || "unverified").toLowerCase();
        let matchesStatus = false;

        if (statusValue === "all") {
            matchesStatus = true;
        } else if (statusValue === "invalid") {
            // Group 'rejected' and 'invalid' together under the Invalid filter
            matchesStatus = (userStatus === "invalid" || userStatus === "rejected");
        } else {
            matchesStatus = (userStatus === statusValue);
        }

        // Only keep user if they pass all three filters
        return matchesSearch && matchesArea && matchesStatus;
    });

    // Redraw table with the filtered results
    renderTable(filteredUsers);
}

// 5. Attach Event Listeners to Inputs
const searchEl = document.getElementById("search");
const areaEl = document.getElementById("areaFilter");
const statusEl = document.getElementById("statusFilter");

if (searchEl) searchEl.addEventListener("input", filterTable); // Triggers on every keystroke
if (areaEl) areaEl.addEventListener("change", filterTable);    // Triggers on dropdown select
if (statusEl) statusEl.addEventListener("change", filterTable); // Triggers on dropdown select

// 6. Start Initial Fetch
fetchCitizens();