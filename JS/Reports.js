import { firestore } from './auth.js';

import {
    collection,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import { initCardMap } from "./gmapComponent.js";
import { writeLog } from "./logging.js";

let reportsData = [];

const tableBody = document.querySelector('.tableDiv.reports tbody');
const modalContainer = document.getElementById('modal-container');

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS FOR FILTERING
// ═══════════════════════════════════════════════════════════════

const searchInput = document.getElementById('search');
const categorySelect = document.querySelector('#report_sort select');
const statusSelect = document.querySelector('#status_sort select');

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS FOR STATS
// ═══════════════════════════════════════════════════════════════

const btnUnresolved = document.getElementById('unresolved_btn');
const btnResolved = document.getElementById('resolved_btn');

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════════════
// INITIALIZE
// ═══════════════════════════════════════════════════════════════

async function init() {
    await fetchReports();
    setupEventListeners();
    applyFilters();
    updateStats('Unresolved');
}

// ═══════════════════════════════════════════════════════════════
// FETCH REPORTS
// ═══════════════════════════════════════════════════════════════

async function fetchReports() {
    try {
        const querySnapshot = await getDocs(
            collection(firestore, "Reports")
        );

        reportsData = [];

        for (const documentSnapshot of querySnapshot.docs) {
            const data = documentSnapshot.data();

            let userName = data.createdBy || "Resident";
            let userContact = "N/A";
            let userAddress = "N/A";

            // Fetch User Contact & Details based on createdBy ID
            if (data.createdBy) {
                try {
                    const userRef = doc(
                        firestore,
                        "Info_User",
                        data.createdBy
                    );

                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists()) {
                        const userData = userSnap.data();

                        userName = `${userData.fName || ''} ${userData.lName || ''}`.trim();

                        userContact = userData.contactMain || "N/A";
                        userAddress = userData.address || "N/A";
                    }
                } catch (e) {
                    console.error(
                        "Error fetching user data:",
                        e
                    );
                }
            }

            reportsData.push({
                docId: documentSnapshot.id,
                ...data,
                userName: userName,
                userContact: userContact,
                userAddress: userAddress
            });
        }

    } catch (error) {
        console.error(
            "Error fetching reports:",
            error
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {

    if (searchInput) {
        searchInput.addEventListener(
            'input',
            applyFilters
        );
    }

    if (categorySelect) {
        categorySelect.addEventListener(
            'change',
            applyFilters
        );
    }

    if (statusSelect) {
        statusSelect.addEventListener(
            'change',
            applyFilters
        );
    }

    if (btnUnresolved) {
        btnUnresolved.addEventListener('click', () => {
            setStatTab('Unresolved');

            if (statusSelect) {
                statusSelect.value = 'Unresolved';
            }

            applyFilters();
        });
    }

    if (btnResolved) {
        btnResolved.addEventListener('click', () => {
            setStatTab('Resolved');

            if (statusSelect) {
                statusSelect.value = 'Resolved';
            }

            applyFilters();
        });
    }

    const mapButton = document.querySelector('.btn.map');

    if (mapButton) {
        mapButton.addEventListener(
            'click',
            openMapModal
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// FILTER REPORTS
// ═══════════════════════════════════════════════════════════════

function applyFilters() {

    const searchTerm =
        searchInput?.value?.toLowerCase() || '';

    const categoryFilter =
        categorySelect?.value || 'All Reports';

    const statusFilter =
        statusSelect?.value || 'All';

    const filtered = reportsData.filter(report => {

        const matchesSearch =
            report.description
                ?.toLowerCase()
                .includes(searchTerm) ||

            report.reportID
                ?.toLowerCase()
                .includes(searchTerm) ||

            report.location
                ?.toLowerCase()
                .includes(searchTerm);

        const matchesCategory =
            categoryFilter === 'All Reports' ||
            report.category === categoryFilter;

        let matchesStatus;

        if (statusFilter === 'All') {

            matchesStatus = true;

        } else if (statusFilter === 'Feedback') {

            matchesStatus =
                report.category === 'Feedback';

        } else {

            matchesStatus =
                report.status === statusFilter;
        }

        return (
            matchesSearch &&
            matchesCategory &&
            matchesStatus
        );
    });

    renderTable(filtered);
}

// ═══════════════════════════════════════════════════════════════
// RENDER REPORT TABLE
// ═══════════════════════════════════════════════════════════════

function renderTable(data) {

    if (!tableBody) return;

    tableBody.innerHTML = '';

    data.forEach(report => {

        const dateObj =
            report.createdOn &&
            typeof report.createdOn.toDate === 'function'
                ? report.createdOn.toDate()
                : new Date();

        const dateString =
            dateObj.toLocaleDateString(
                'en-US',
                {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }
            );

        const timeString =
            dateObj.toLocaleTimeString(
                'en-US',
                {
                    hour: 'numeric',
                    minute: '2-digit'
                }
            );

        const tr = document.createElement('tr');

        const categoryClass =
            report.category
                ? report.category
                    .toLowerCase()
                    .replace(/\s+/g, '')
                : 'community';

        const statusClass =
            report.status === 'Resolved'
                ? 'resolved'
                : (
                    report.status === 'Invalid'
                        ? 'invalid'
                        : ''
                );

        tr.className =
            `tableRow ${categoryClass} ${statusClass}`.trim();

        const titleLine =
            report.status === 'Invalid'
                ? `${report.reportID || 'N/A'} | ${report.History?.reason || 'N/A'}`
                : `${report.reportID || 'N/A'} | ${report.type || 'N/A'}`;

        tr.innerHTML = `
            <td class="user-section">
                <div class="dot">●</div>

                <div class="user-info">
                    <strong>${titleLine}</strong>
                    <br>
                    <span>${dateString} · ${timeString}</span>
                </div>
            </td>

            <td class="location">
                ${report.location || 'N/A'}
            </td>

            <td>
                ${report.userName || 'N/A'}
            </td>

            <td>
                ${report.userContact || 'N/A'}
            </td>
        `;

        tr.addEventListener(
            'click',
            () => openInfoModal(
                report,
                dateString,
                timeString
            )
        );

        tableBody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════════════
// STAT TAB
// ═══════════════════════════════════════════════════════════════

function setStatTab(status) {

    if (status === 'Unresolved') {

        if (btnUnresolved) {
            btnUnresolved.className = 'btn active';
        }

        if (btnResolved) {
            btnResolved.className = 'btn inactive';
        }

    } else {

        if (btnUnresolved) {
            btnUnresolved.className = 'btn inactive';
        }

        if (btnResolved) {
            btnResolved.className = 'btn active';
        }
    }

    updateStats(status);
}

// ═══════════════════════════════════════════════════════════════
// UPDATE STATISTICS
// ═══════════════════════════════════════════════════════════════

function updateStats(statusFilter) {

    const relevantReports =
        reportsData.filter(r => {

            if (statusFilter === 'All') {
                return true;
            }

            if (statusFilter === 'Feedback') {
                return r.category === 'Feedback';
            }

            return r.status === statusFilter;
        });

    const counts = {
        'Emergency': 0,
        'Public Safety': 0,
        'Community': 0,
        'Feedback': 0
    };

    relevantReports.forEach(r => {

        if (counts[r.category] !== undefined) {
            counts[r.category]++;
        }
    });

    // ═══════════════════════════════════════════════════════════
    // THIS MONTH COUNTS
    // ═══════════════════════════════════════════════════════════

    const now = new Date();

    const monthCounts = {
        'Emergency': 0,
        'Public Safety': 0,
        'Community': 0,
        'Feedback': 0
    };

    reportsData.forEach(r => {

        if (
            r.status !== 'Unresolved' &&
            r.status !== 'Resolved'
        ) {
            return;
        }

        if (monthCounts[r.category] === undefined) {
            return;
        }

        const d =
            r.createdOn &&
            typeof r.createdOn.toDate === 'function'
                ? r.createdOn.toDate()
                : null;

        if (
            d &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
        ) {
            monthCounts[r.category]++;
        }
    });

    const trendEls = [
        'aa',
        'bb',
        'cc',
        'dd'
    ].map(k =>
        document.querySelector(`.stat-trend.${k}`)
    );

    [
        'Emergency',
        'Public Safety',
        'Community',
        'Feedback'
    ].forEach((cat, i) => {

        if (trendEls[i]) {
            trendEls[i].textContent =
                `${monthCounts[cat]} This Month`;
        }
    });

    const statVals =
        document.querySelectorAll('.stat-val');

    if (statVals.length >= 4) {

        statVals[0].textContent =
            counts['Emergency'];

        statVals[1].textContent =
            counts['Public Safety'];

        statVals[2].textContent =
            counts['Community'];

        statVals[3].textContent =
            counts['Feedback'];
    }
}

// ═══════════════════════════════════════════════════════════════
// OPEN INFORMATION MODAL
// ═══════════════════════════════════════════════════════════════

async function openInfoModal(
    report,
    dateStr,
    timeStr
) {

    try {

        const isFeedback =
            report.category === 'Feedback';

        const modalPath =
            isFeedback
                ? '../Popups/Info_Feedback.html'
                : '../Popups/Info_Report.html';

        const response =
            await fetch(modalPath);

        const html =
            await response.text();

        modalContainer.innerHTML = html;

        // ═══════════════════════════════════════════════════════
        // POPULATE INFORMATION TABLE
        // ═══════════════════════════════════════════════════════

        const infoTable =
            modalContainer.querySelector(
                '.information.wide'
            );

        if (infoTable) {

            const rows =
                infoTable.querySelectorAll('tr');

            const updateRow = (
                index,
                value
            ) => {

                if (!rows[index]) return;

                const cells =
                    rows[index].querySelectorAll('td');

                if (cells.length > 1) {
                    cells[1].textContent =
                        value ?? 'N/A';
                }
            };

            if (isFeedback) {

                updateRow(
                    0,
                    report.reportID || 'N/A'
                );

                updateRow(
                    1,
                    report.type || 'N/A'
                );

                updateRow(
                    2,
                    report.description || 'N/A'
                );

                updateRow(
                    3,
                    `${dateStr} · ${timeStr}`
                );

                updateRow(
                    4,
                    report.userName || 'N/A'
                );

                updateRow(
                    5,
                    report.createdBy || 'N/A'
                );

                updateRow(
                    6,
                    report.userContact || 'N/A'
                );

            } else {

                updateRow(
                    0,
                    report.reportID || 'N/A'
                );

                updateRow(
                    1,
                    report.type || 'N/A'
                );

                updateRow(
                    2,
                    report.description || 'N/A'
                );

                updateRow(
                    3,
                    report.location || 'N/A'
                );

                updateRow(
                    4,
                    `${dateStr} · ${timeStr}`
                );

                updateRow(
                    5,
                    report.userName || 'N/A'
                );

                updateRow(
                    6,
                    report.createdBy || 'N/A'
                );

                updateRow(
                    7,
                    report.userContact || 'N/A'
                );

                updateRow(
                    8,
                    report.userAddress || 'N/A'
                );
            }
        }

        // ═══════════════════════════════════════════════════════
        // REPORT ACTION / STATUS CARDS
        // ═══════════════════════════════════════════════════════

        if (!isFeedback) {

            const actionButtons =
                modalContainer.querySelector(
                    '#actionButtons'
                );

            const resolvedCard =
                modalContainer.querySelector(
                    '#resolvedCard'
                );

            const invalidCard =
                modalContainer.querySelector(
                    '#invalidCard'
                );

            if (
                actionButtons &&
                resolvedCard &&
                invalidCard
            ) {

                if (report.status === 'Resolved') {

                    actionButtons.style.display =
                        'none';

                    resolvedCard.style.display =
                        'block';

                    invalidCard.style.display =
                        'none';

                    const resDate =
                        report.History?.resolvedOn
                            ? report.History.resolvedOn
                                .toDate()
                                .toLocaleString(
                                    'en-US',
                                    {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit'
                                    }
                                )
                            : 'N/A';

                    const resOn =
                        modalContainer.querySelector(
                            '#resOn'
                        );

                    const resBy =
                        modalContainer.querySelector(
                            '#resBy'
                        );

                    const resAction =
                        modalContainer.querySelector(
                            '#resAction'
                        );

                    if (resOn) {
                        resOn.textContent =
                            resDate;
                    }

                    if (resBy) {
                        resBy.textContent =
                            report.History?.resolvedBy ||
                            'N/A';
                    }

                    if (resAction) {
                        resAction.textContent =
                            report.History?.action ||
                            'N/A';
                    }

                } else if (
                    report.status === 'Invalid'
                ) {

                    actionButtons.style.display =
                        'none';

                    invalidCard.style.display =
                        'block';

                    resolvedCard.style.display =
                        'none';

                    const invDate =
                        report.History?.closedOn
                            ? report.History.closedOn
                                .toDate()
                                .toLocaleString(
                                    'en-US',
                                    {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit'
                                    }
                                )
                            : 'N/A';

                    const invOn =
                        modalContainer.querySelector(
                            '#invOn'
                        );

                    const invBy =
                        modalContainer.querySelector(
                            '#invBy'
                        );

                    const invReason =
                        modalContainer.querySelector(
                            '#invReason'
                        );

                    if (invOn) {
                        invOn.textContent =
                            invDate;
                    }

                    if (invBy) {
                        invBy.textContent =
                            report.History?.closedBy ||
                            'N/A';
                    }

                    if (invReason) {
                        invReason.textContent =
                            report.History?.reason ||
                            'N/A';
                    }

                } else {

                    actionButtons.style.display =
                        'flex';

                    resolvedCard.style.display =
                        'none';

                    invalidCard.style.display =
                        'none';

                    const btnInvalid =
                        modalContainer.querySelector(
                            '#btnInvalid'
                        );

                    const btnResolve =
                        modalContainer.querySelector(
                            '#btnResolve'
                        );

                    if (btnInvalid) {
                        btnInvalid.onclick =
                            () => openInvalidPopup(report);
                    }

                    if (btnResolve) {
                        btnResolve.onclick =
                            () => openResolvePopup(report);
                    }
                }

            } else {

                console.error(
                    "DOM Error: Could not find #actionButtons, #resolvedCard, or #invalidCard in the injected HTML."
                );
            }

            // ═══════════════════════════════════════════════════
            // POPULATE USER REPORT HISTORY
            // ═══════════════════════════════════════════════════

            const historyList =
                modalContainer.querySelector(
                    '.history-list'
                );

            if (historyList) {

                historyList.innerHTML = '';

                // Get ALL reports made by the same user
                // regardless of their current status.
                const userReports =
                    reportsData
                        .filter(
                            r =>
                                r.createdBy ===
                                report.createdBy
                        )
                        .sort((a, b) => {

                            const dateA =
                                a.createdOn &&
                                typeof a.createdOn.toDate === 'function'
                                    ? a.createdOn.toDate()
                                    : new Date(0);

                            const dateB =
                                b.createdOn &&
                                typeof b.createdOn.toDate === 'function'
                                    ? b.createdOn.toDate()
                                    : new Date(0);

                            // Newest reports first
                            return dateB - dateA;
                        });

                // ═══════════════════════════════════════════════
                // ADD EACH USER REPORT
                // ═══════════════════════════════════════════════

                userReports.forEach(userReport => {

                    const createdDate =
                        userReport.createdOn &&
                        typeof userReport.createdOn.toDate === 'function'
                            ? userReport.createdOn.toDate()
                            : null;

                    if (!createdDate) return;

                    const createdDateStr =
                        createdDate.toLocaleDateString(
                            'en-US',
                            {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                            }
                        );

                    const createdTimeStr =
                        createdDate.toLocaleTimeString(
                            'en-US',
                            {
                                hour: 'numeric',
                                minute: '2-digit'
                            }
                        );

                    // ═══════════════════════════════════════════
                    // CREATED ITEM
                    // ═══════════════════════════════════════════

                    const createdItem =
                        document.createElement('div');

                    createdItem.className =
                        'history-item';

                    const statusText =
                        userReport.status ||
                        'Unresolved';

                    createdItem.innerHTML = `
                        <div class="title">
                            ${userReport.reportID || 'N/A'} | ${userReport.type || 'Report'}
                        </div>

                        <div class="desc">
                            ${userReport.description || 'No description provided.'}
                        </div>

                        <div class="meta">
                            <span>
                                ${createdDateStr} · ${createdTimeStr}
                            </span>

                            <span>
                                ${statusText}
                            </span>
                        </div>
                    `;

                    historyList.appendChild(
                        createdItem
                    );

                    // ═══════════════════════════════════════════
                    // RESOLVED HISTORY
                    // ═══════════════════════════════════════════

                    if (
                        userReport.status === 'Resolved' &&
                        userReport.History?.resolvedOn
                    ) {

                        const resolvedDate =
                            userReport.History.resolvedOn.toDate();

                        const resolvedDateStr =
                            resolvedDate.toLocaleDateString(
                                'en-US',
                                {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                }
                            );

                        const resolvedTimeStr =
                            resolvedDate.toLocaleTimeString(
                                'en-US',
                                {
                                    hour: 'numeric',
                                    minute: '2-digit'
                                }
                            );

                        const resolvedItem =
                            document.createElement('div');

                        resolvedItem.className =
                            'history-item';

                        resolvedItem.innerHTML = `
                            <div class="title">
                                ${userReport.reportID || 'N/A'} | Resolved
                            </div>

                            <div class="desc">
                                Action taken: ${userReport.History.action || 'N/A'}
                            </div>

                            <div class="meta">
                                <span>
                                    ${resolvedDateStr} · ${resolvedTimeStr}
                                </span>

                                <span>
                                    Resolved
                                </span>
                            </div>
                        `;

                        historyList.appendChild(
                            resolvedItem
                        );
                    }

                    // ═══════════════════════════════════════════
                    // INVALID HISTORY
                    // ═══════════════════════════════════════════

                    if (
                        userReport.status === 'Invalid' &&
                        userReport.History?.closedOn
                    ) {

                        const invalidDate =
                            userReport.History.closedOn.toDate();

                        const invalidDateStr =
                            invalidDate.toLocaleDateString(
                                'en-US',
                                {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                }
                            );

                        const invalidTimeStr =
                            invalidDate.toLocaleTimeString(
                                'en-US',
                                {
                                    hour: 'numeric',
                                    minute: '2-digit'
                                }
                            );

                        const invalidItem =
                            document.createElement('div');

                        invalidItem.className =
                            'history-item';

                        invalidItem.innerHTML = `
                            <div class="title">
                                ${userReport.reportID || 'N/A'} | Closed as Invalid
                            </div>

                            <div class="desc">
                                Reason: ${userReport.History.reason || 'N/A'}
                            </div>

                            <div class="meta">
                                <span>
                                    ${invalidDateStr} · ${invalidTimeStr}
                                </span>

                                <span>
                                    Invalid
                                </span>
                            </div>
                        `;

                        historyList.appendChild(
                            invalidItem
                        );
                    }
                });

                // ═══════════════════════════════════════════════
                // NO HISTORY
                // ═══════════════════════════════════════════════

                if (userReports.length === 0) {

                    historyList.innerHTML = `
                        <div class="history-item">
                            <div class="desc">
                                No report history found for this user.
                            </div>
                        </div>
                    `;
                }
            }
        }

        // ═══════════════════════════════════════════════════════
        // SHOW MODAL
        // ═══════════════════════════════════════════════════════

        const overlayId =
            isFeedback
                ? 'infoFeedback'
                : 'infoReport';

        const overlay =
            document.getElementById(overlayId);

        if (overlay) {

            overlay.style.display = 'flex';

            overlay.addEventListener(
                'click',
                (e) => {

                    if (e.target === overlay) {
                        modalContainer.innerHTML = '';
                    }
                }
            );
        }

    } catch (error) {

        console.error(
            "Error loading Info Modal:",
            error
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// OPEN MAP MODAL
// ═══════════════════════════════════════════════════════════════

async function openMapModal() {

    try {

        const response =
            await fetch(
                '../Popups/Reports_Map.html'
            );

        const html =
            await response.text();

        modalContainer.innerHTML = html;

        const reportsCenter = {
            lat: 14.7391,
            lng: 121.0532
        };

        // Filter out Resolved reports and Feedback
        // before mapping.
        const reportMarkers =
            reportsData

                .filter(report =>
                    report.status !== 'Resolved' &&
                    report.category !== 'Feedback'
                )

                .map(report => {

                    if (!report.pinLocation) {
                        return null;
                    }

                    let lat;
                    let lng;

                    if (
                        typeof report.pinLocation.latitude !==
                        'undefined'
                    ) {

                        lat =
                            report.pinLocation.latitude;

                        lng =
                            report.pinLocation.longitude;

                    } else if (
                        typeof report.pinLocation.lat !==
                        'undefined'
                    ) {

                        lat =
                            parseFloat(
                                report.pinLocation.lat
                            );

                        lng =
                            parseFloat(
                                report.pinLocation.lng
                            );
                    }

                    if (
                        typeof lat === 'number' &&
                        typeof lng === 'number' &&
                        !isNaN(lat) &&
                        !isNaN(lng)
                    ) {

                        return {
                            lat: lat,
                            lng: lng,

                            title:
                                `${report.reportID || 'ID'} | ${report.type || 'Type'}`,

                            snippet:
                                `Status: ${report.status || 'Unknown'}`
                        };
                    }

                    return null;
                })

                .filter(
                    marker => marker !== null
                );

        initCardMap(
            "reportsMapCard",
            reportsCenter,
            15,
            reportMarkers
        );

        const overlay =
            document.getElementById(
                'reportsMapModal'
            );

        if (overlay) {

            overlay.addEventListener(
                'click',
                (e) => {

                    if (e.target === overlay) {
                        modalContainer.innerHTML = '';
                    }
                }
            );
        }

    } catch (error) {

        console.error(
            "Error loading Reports_Map.html:",
            error
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// SUB-MODAL LOGIC
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// INVALID REPORT
// ═══════════════════════════════════════════════════════════════

async function openInvalidPopup(report) {

    try {

        const response =
            await fetch(
                '../Popups/Report_Invalid.html'
            );

        const html =
            await response.text();

        // Stack popup over existing modal
        const popupContainer =
            document.createElement('div');

        popupContainer.innerHTML = html;

        document.body.appendChild(
            popupContainer
        );

        const overlay =
            popupContainer.querySelector(
                '#reportInvalid'
            );

        if (overlay) {
            overlay.style.display = 'flex';
        }

        const title =
            popupContainer.querySelector(
                '.diatitle'
            );

        if (title) {
            title.textContent =
                `Close ${report.reportID || 'Report'}?`;
        }

        const btnCancel =
            popupContainer.querySelector(
                '.button.delete'
            );

        const btnConfirm =
            popupContainer.querySelector(
                '.button.confirm'
            );

        const selectReason =
            popupContainer.querySelector(
                '.form-select'
            );

        if (btnCancel) {

            btnCancel.onclick = () => {

                document.body.removeChild(
                    popupContainer
                );
            };
        }

        if (btnConfirm) {

            btnConfirm.onclick = async () => {

                const reason =
                    selectReason?.value || '';

                if (!reason) {
                    alert(
                        "Please select a reason."
                    );
                    return;
                }

                // Get logged-in Staff ID
                const staffData =
                    JSON.parse(
                        sessionStorage.getItem(
                            "userData"
                        ) || "{}"
                    );

                const currentStaffId =
                    staffData.staffID ||
                    'Unknown Staff';

                // Update Firestore
                const reportRef =
                    doc(
                        firestore,
                        "Reports",
                        report.docId
                    );

                await updateDoc(
                    reportRef,
                    {
                        status: "Invalid",

                        History: {
                            closedOn:
                                Timestamp.now(),

                            closedBy:
                                currentStaffId,

                            reason:
                                reason
                        }
                    }
                );

                writeLog(
                    "Edit",
                    "Marked Report Invalid",
                    report.reportID,
                    `${report.reportID} marked invalid — Reason: ${reason}`
                );

                // Cleanup
                document.body.removeChild(
                    popupContainer
                );

                modalContainer.innerHTML = '';

                // Reload data
                await fetchReports();

                applyFilters();

                updateStats(
                    statusSelect?.value ||
                    'All'
                );
            };
        }

    } catch (error) {

        console.error(
            "Error opening Invalid popup:",
            error
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// RESOLVE REPORT
// ═══════════════════════════════════════════════════════════════

async function openResolvePopup(report) {

    try {

        const response =
            await fetch(
                '../Popups/Report_Resolved.html'
            );

        const html =
            await response.text();

        const popupContainer =
            document.createElement('div');

        popupContainer.innerHTML = html;

        document.body.appendChild(
            popupContainer
        );

        const overlay =
            popupContainer.querySelector(
                '#reportResolved'
            );

        if (overlay) {
            overlay.style.display = 'flex';
        }

        const title =
            popupContainer.querySelector(
                '.diatitle'
            );

        if (title) {

            title.textContent =
                `Resolve ${report.reportID || 'Report'}?`;
        }

        const btnCancel =
            popupContainer.querySelector(
                '.button.delete'
            );

        const btnConfirm =
            popupContainer.querySelector(
                '.button.confirm'
            );

        const txtAction =
            popupContainer.querySelector(
                'textarea.form-input'
            );

        if (btnCancel) {

            btnCancel.onclick = () => {

                document.body.removeChild(
                    popupContainer
                );
            };
        }

        if (btnConfirm) {

            btnConfirm.onclick = async () => {

                const actionText =
                    txtAction?.value.trim() || '';

                if (!actionText) {

                    alert(
                        "Please provide the action taken."
                    );

                    return;
                }

                // Get logged-in Staff ID
                const staffData =
                    JSON.parse(
                        sessionStorage.getItem(
                            "userData"
                        ) || "{}"
                    );

                const currentStaffId =
                    staffData.staffID ||
                    'Unknown Staff';

                // Update Firestore
                const reportRef =
                    doc(
                        firestore,
                        "Reports",
                        report.docId
                    );

                await updateDoc(
                    reportRef,
                    {
                        status: "Resolved",

                        History: {
                            resolvedOn:
                                Timestamp.now(),

                            resolvedBy:
                                currentStaffId,

                            action:
                                actionText
                        }
                    }
                );

                writeLog(
                    "Verify",
                    "Resolved Report",
                    report.reportID,
                    `${report.reportID} resolved — ${actionText}`
                );

                // Cleanup
                document.body.removeChild(
                    popupContainer
                );

                modalContainer.innerHTML = '';

                // Reload data
                await fetchReports();

                applyFilters();

                updateStats(
                    statusSelect?.value ||
                    'All'
                );
            };
        }

    } catch (error) {

        console.error(
            "Error opening Resolve popup:",
            error
        );
    }
}
