import { firestore } from './auth.js';
import { getStorage, ref as storageRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import {
    collection,
    onSnapshot, // Added onSnapshot for live updates
    doc,
    getDoc,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

import { initCardMap } from "./gmapComponent.js";
import { writeLog } from "./logging.js";
import { confirmExport, runWithLoading, downloadCSV, todayStamp } from "./dialogs.js";

let reportsData = [];
const userCache = new Map(); // Cache user profiles so real-time updates don't make redundant reads
let unsubscribeReports = null;

const tableBody = document.querySelector('.tableDiv.reports tbody');
const modalContainer = document.getElementById('modal-container');

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS FOR FILTERING & STATS
// ═══════════════════════════════════════════════════════════════

const searchInput = document.getElementById('search');
const categorySelect = document.querySelector('#report_sort select');
const statusSelect = document.querySelector('#status_sort select');
const btnUnresolved = document.getElementById('unresolved_btn');
const btnResolved = document.getElementById('resolved_btn');

document.addEventListener('DOMContentLoaded', init);

// ═══════════════════════════════════════════════════════════════
// INITIALIZE & SUBSCRIBE TO REALTIME UPDATES
// ═══════════════════════════════════════════════════════════════

function init() {
    setupEventListeners();
    setupExport();
    subscribeToReports(); // Listen for live database changes
}

function subscribeToReports() {
    if (unsubscribeReports) unsubscribeReports(); // Prevent duplicate listeners

    const reportsRef = collection(firestore, "Reports");

    // Real-time listener
    unsubscribeReports = onSnapshot(reportsRef, async (querySnapshot) => {
        const updatedReports = [];

        for (const documentSnapshot of querySnapshot.docs) {
            const data = documentSnapshot.data();

            let userName = data.createdBy || "Resident";
            let userContact = "N/A";
            let userAddress = "N/A";

            // Fetch user info from cache or Firestore
            if (data.createdBy) {
                if (userCache.has(data.createdBy)) {
                    const cached = userCache.get(data.createdBy);
                    userName = cached.userName;
                    userContact = cached.userContact;
                    userAddress = cached.userAddress;
                } else {
                    try {
                        const userRef = doc(firestore, "Info_User", data.createdBy);
                        const userSnap = await getDoc(userRef);

                        if (userSnap.exists()) {
                            const userData = userSnap.data();
                            userName = `${userData.fName || ''} ${userData.lName || ''}`.trim();
                            userContact = userData.contactMain || "N/A";
                            userAddress = userData.address || "N/A";

                            // Store in cache
                            userCache.set(data.createdBy, { userName, userContact, userAddress });
                        }
                    } catch (e) {
                        console.error("Error fetching user data:", e);
                    }
                }
            }

            updatedReports.push({
                docId: documentSnapshot.id,
                ...data,
                userName: userName,
                userContact: userContact,
                userAddress: userAddress
            });
        }

        // Update global state and immediately refresh table + stats
        reportsData = updatedReports;
        applyFilters();
        updateStats(statusSelect?.value || 'Unresolved');
    }, (error) => {
        console.error("Realtime Reports listener error:", error);
    });
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function setupEventListeners() {
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (categorySelect) categorySelect.addEventListener('change', applyFilters);
    if (statusSelect) statusSelect.addEventListener('change', applyFilters);

    if (btnUnresolved) {
        btnUnresolved.addEventListener('click', () => {
            setStatTab('Unresolved');
            if (statusSelect) statusSelect.value = 'Unresolved';
            applyFilters();
        });
    }

    if (btnResolved) {
        btnResolved.addEventListener('click', () => {
            setStatTab('Resolved');
            if (statusSelect) statusSelect.value = 'Resolved';
            applyFilters();
        });
    }

    const mapButton = document.querySelector('.btn.map');
    if (mapButton) mapButton.addEventListener('click', openMapModal);
}

// ═══════════════════════════════════════════════════════════════
// FILTER REPORTS
// ═══════════════════════════════════════════════════════════════

function applyFilters() {
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const categoryFilter = categorySelect?.value || 'All Reports';
    const statusFilter = statusSelect?.value || 'All';

    const filtered = reportsData.filter(report => {
        const matchesSearch =
            report.description?.toLowerCase().includes(searchTerm) ||
            report.reportID?.toLowerCase().includes(searchTerm) ||
            report.location?.toLowerCase().includes(searchTerm);

        const matchesCategory =
            categoryFilter === 'All Reports' || report.category === categoryFilter;

        let matchesStatus;
        if (statusFilter === 'All') {
            matchesStatus = true;
        } else if (statusFilter === 'Feedback') {
            matchesStatus = report.category === 'Feedback';
        } else {
            matchesStatus = report.status === statusFilter;
        }

        return matchesSearch && matchesCategory && matchesStatus;
    });

    renderTable(filtered);
}

// ═══════════════════════════════════════════════════════════════
// RENDER REPORT TABLE
// ═══════════════════════════════════════════════════════════════

function renderTable(data) {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const timeOf = (r) => r.createdOn && typeof r.createdOn.toDate === 'function'
        ? r.createdOn.toDate().getTime()
        : 0;

    data = [...data].sort((a, b) =>
        timeOf(b) - timeOf(a) ||
        String(b.reportID || '').localeCompare(String(a.reportID || ''), undefined, { numeric: true })
    );

    data.forEach(report => {
        const dateObj = report.createdOn && typeof report.createdOn.toDate === 'function'
            ? report.createdOn.toDate()
            : new Date();

        const dateString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        const tr = document.createElement('tr');
        const categoryClass = report.category ? report.category.toLowerCase().replace(/\s+/g, '') : 'community';
        const statusClass = report.status === 'Resolved' ? 'resolved' : (report.status === 'Invalid' ? 'invalid' : '');

        tr.className = `tableRow ${categoryClass} ${statusClass}`.trim();

        const titleLine = report.status === 'Invalid'
            ? `${report.reportID || 'N/A'} | ${report.History?.reason || 'N/A'}`
            : `${report.reportID || 'N/A'} | ${report.type || 'N/A'}`;

        tr.innerHTML = `
            <td class="user-section">
                <div class="dot">●</div>
                <div class="user-info">
                    <strong>${titleLine}</strong><br>
                    <span>${dateString} · ${timeString}</span>
                </div>
            </td>
            <td class="location">${report.location || 'N/A'}</td>
            <td>${report.userName || 'N/A'}</td>
            <td>${report.userContact || 'N/A'}</td>
        `;

        tr.addEventListener('click', () => openInfoModal(report, dateString, timeString));
        tableBody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════════════
// STAT TAB & STATISTICS
// ═══════════════════════════════════════════════════════════════

function setStatTab(status) {
    if (status === 'Unresolved') {
        if (btnUnresolved) btnUnresolved.className = 'btn active';
        if (btnResolved) btnResolved.className = 'btn inactive';
    } else {
        if (btnUnresolved) btnUnresolved.className = 'btn inactive';
        if (btnResolved) btnResolved.className = 'btn active';
    }
    updateStats(status);
}

function updateStats(statusFilter) {
    const relevantReports = reportsData.filter(r => {
        if (statusFilter === 'All') return true;
        if (statusFilter === 'Feedback') return r.category === 'Feedback';
        return r.status === statusFilter;
    });

    const counts = { 'Emergency': 0, 'Public Safety': 0, 'Community': 0, 'Feedback': 0 };
    relevantReports.forEach(r => { if (counts[r.category] !== undefined) counts[r.category]++; });

    const now = new Date();
    const monthCounts = { 'Emergency': 0, 'Public Safety': 0, 'Community': 0, 'Feedback': 0 };

    reportsData.forEach(r => {
        if (r.status !== 'Unresolved' && r.status !== 'Resolved') return;
        if (monthCounts[r.category] === undefined) return;

        const d = r.createdOn && typeof r.createdOn.toDate === 'function' ? r.createdOn.toDate() : null;
        if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
            monthCounts[r.category]++;
        }
    });

    const trendEls = ['aa', 'bb', 'cc', 'dd'].map(k => document.querySelector(`.stat-trend.${k}`));
    ['Emergency', 'Public Safety', 'Community', 'Feedback'].forEach((cat, i) => {
        if (trendEls[i]) trendEls[i].textContent = `${monthCounts[cat]} This Month`;
    });

    const statVals = document.querySelectorAll('.stat-val');
    if (statVals.length >= 4) {
        statVals[0].textContent = counts['Emergency'];
        statVals[1].textContent = counts['Public Safety'];
        statVals[2].textContent = counts['Community'];
        statVals[3].textContent = counts['Feedback'];
    }
}

// ═══════════════════════════════════════════════════════════════
// OPEN INFORMATION MODAL
// ═══════════════════════════════════════════════════════════════

async function openInfoModal(report, dateStr, timeStr) {
    try {
        const isFeedback = report.category === 'Feedback';
        const modalPath = isFeedback ? '../Popups/Info_Feedback.html' : '../Popups/Info_Report.html';
        const response = await fetch(modalPath);
        const html = await response.text();

        modalContainer.innerHTML = html;

        const infoTable = modalContainer.querySelector('.information.wide');
        if (infoTable) {
            const rows = infoTable.querySelectorAll('tr');
            const updateRow = (index, value) => {
                if (!rows[index]) return;
                const cells = rows[index].querySelectorAll('td');
                if (cells.length > 1) cells[1].textContent = value ?? 'N/A';
            };

            if (isFeedback) {
                updateRow(0, report.reportID || 'N/A');
                updateRow(1, report.type || 'N/A');
                updateRow(2, report.description || 'N/A');
                updateRow(3, `${dateStr} · ${timeStr}`);
                updateRow(4, report.userName || 'N/A');
                updateRow(5, report.createdBy || 'N/A');
                updateRow(6, report.userContact || 'N/A');
            } else {
                updateRow(0, report.reportID || 'N/A');
                updateRow(1, report.type || 'N/A');
                updateRow(2, report.description || 'N/A');
                updateRow(3, report.location || 'N/A');
                updateRow(4, `${dateStr} · ${timeStr}`);
                updateRow(5, report.userName || 'N/A');
                updateRow(6, report.createdBy || 'N/A');
                updateRow(7, report.userContact || 'N/A');
                updateRow(8, report.userAddress || 'N/A');
            }
        }

        // Photo Evidence Handling
        if (!isFeedback) {
            const photoContainer = modalContainer.querySelector('#photoEvidenceContainer');
            if (photoContainer) {
                photoContainer.innerHTML = '';
                if (report.photos && Array.isArray(report.photos) && report.photos.length > 0) {
                    const storage = getStorage();
                    report.photos.forEach((photoPath, index) => {
                        const wrapper = document.createElement('div');
                        wrapper.style.textAlign = 'center';
                        wrapper.style.padding = '20px';
                        wrapper.style.border = '1px solid #ddd';
                        wrapper.style.borderRadius = '8px';
                        wrapper.innerHTML = `<span style="color: #888;">Loading Photo ${index + 1}...</span>`;
                        photoContainer.appendChild(wrapper);

                        getDownloadURL(storageRef(storage, photoPath))
                            .then(url => {
                                wrapper.style.padding = '0';
                                wrapper.style.border = 'none';
                                wrapper.innerHTML = `
                                    <a href="${url}" target="_blank" title="Click to view full size">
                                        <img src="${url}" style="width: 100%; border-radius: 8px; border: 1px solid #ddd; cursor: pointer; object-fit: cover;">
                                    </a>
                                `;
                            })
                            .catch(err => {
                                console.error(`Error loading photo ${index + 1}:`, err);
                                wrapper.innerHTML = `<span style="color: #d32f2f;">Failed to load photo ${index + 1}</span>`;
                            });
                    });
                } else {
                    photoContainer.innerHTML = '<p style="color: #666; font-size: 14px; text-align: center; margin-top: 20px;">No photos included.</p>';
                }
            }
        }

        // Action / Status Cards
        if (!isFeedback) {
            const actionButtons = modalContainer.querySelector('#actionButtons');
            const resolvedCard = modalContainer.querySelector('#resolvedCard');
            const invalidCard = modalContainer.querySelector('#invalidCard');

            if (actionButtons && resolvedCard && invalidCard) {
                if (report.status === 'Resolved') {
                    actionButtons.style.display = 'none';
                    resolvedCard.style.display = 'block';
                    invalidCard.style.display = 'none';

                    const resDate = report.History?.resolvedOn
                        ? report.History.resolvedOn.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'N/A';

                    const resOn = modalContainer.querySelector('#resOn');
                    const resBy = modalContainer.querySelector('#resBy');
                    const resAction = modalContainer.querySelector('#resAction');

                    if (resOn) resOn.textContent = resDate;
                    if (resBy) resBy.textContent = report.History?.resolvedBy || 'N/A';
                    if (resAction) resAction.textContent = report.History?.action || 'N/A';

                } else if (report.status === 'Invalid') {
                    actionButtons.style.display = 'none';
                    invalidCard.style.display = 'block';
                    resolvedCard.style.display = 'none';

                    const invDate = report.History?.closedOn
                        ? report.History.closedOn.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'N/A';

                    const invOn = modalContainer.querySelector('#invOn');
                    const invBy = modalContainer.querySelector('#invBy');
                    const invReason = modalContainer.querySelector('#invReason');

                    if (invOn) invOn.textContent = invDate;
                    if (invBy) invBy.textContent = report.History?.closedBy || 'N/A';
                    if (invReason) invReason.textContent = report.History?.reason || 'N/A';

                } else {
                    actionButtons.style.display = 'flex';
                    resolvedCard.style.display = 'none';
                    invalidCard.style.display = 'none';

                    const btnInvalid = modalContainer.querySelector('#btnInvalid');
                    const btnResolve = modalContainer.querySelector('#btnResolve');

                    if (btnInvalid) btnInvalid.onclick = () => openInvalidPopup(report);
                    if (btnResolve) btnResolve.onclick = () => openResolvePopup(report);
                }
            }
        }

        const overlayId = isFeedback ? 'infoFeedback' : 'infoReport';
        const overlay = document.getElementById(overlayId);

        if (overlay) {
            overlay.style.display = 'flex';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) modalContainer.innerHTML = '';
            });
        }
    } catch (error) {
        console.error("Error loading Info Modal:", error);
    }
}

// ═══════════════════════════════════════════════════════════════
// MAP MODAL & ACTIONS
// ═══════════════════════════════════════════════════════════════

async function openMapModal() {
    try {
        const response = await fetch('../Popups/Reports_Map.html');
        const html = await response.text();
        modalContainer.innerHTML = html;

        const reportsCenter = { lat: 14.7391, lng: 121.0532 };

        const reportMarkers = reportsData
            .filter(report => {
                if (report.status === 'Resolved' || report.category === 'Feedback') return false;
                const created = report.createdOn && typeof report.createdOn.toDate === 'function' ? report.createdOn.toDate() : null;
                return created && (Date.now() - created.getTime()) <= 7 * 24 * 60 * 60 * 1000;
            })
            .map(report => {
                if (!report.pinLocation) return null;
                let lat = typeof report.pinLocation.latitude !== 'undefined' ? report.pinLocation.latitude : parseFloat(report.pinLocation.lat);
                let lng = typeof report.pinLocation.longitude !== 'undefined' ? report.pinLocation.longitude : parseFloat(report.pinLocation.lng);

                if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        lat: lat,
                        lng: lng,
                        title: `${report.reportID || 'ID'} | ${report.type || 'Type'}`,
                        snippet: `Status: ${report.status || 'Unknown'}`,
                        ...(String(report.type || '').trim().toLowerCase() === 'flood'
                            ? { color: '#1A73E8', borderColor: '#0B4EA2' }
                            : String(report.type || '').trim().toLowerCase() === 'fire'
                                ? { color: '#EA4335', borderColor: '#B31412' }
                                : {})
                    };
                }
                return null;
            })
            .filter(marker => marker !== null);

        initCardMap("reportsMapCard", reportsCenter, 15, reportMarkers);

        const overlay = document.getElementById('reportsMapModal');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) modalContainer.innerHTML = '';
            });
        }
    } catch (error) {
        console.error("Error loading Reports_Map.html:", error);
    }
}

async function openInvalidPopup(report) {
    try {
        const response = await fetch('../Popups/Report_Invalid.html');
        const html = await response.text();

        const popupContainer = document.createElement('div');
        popupContainer.innerHTML = html;
        document.body.appendChild(popupContainer);

        const overlay = popupContainer.querySelector('#reportInvalid');
        if (overlay) overlay.style.display = 'flex';

        const title = popupContainer.querySelector('.diatitle');
        if (title) title.textContent = `Close ${report.reportID || 'Report'}?`;

        const btnCancel = popupContainer.querySelector('.button.delete');
        const btnConfirm = popupContainer.querySelector('.button.confirm');
        const selectReason = popupContainer.querySelector('.form-select');

        if (btnCancel) btnCancel.onclick = () => document.body.removeChild(popupContainer);

        if (btnConfirm) {
            btnConfirm.onclick = async () => {
                const reason = selectReason?.value || '';
                if (!reason) {
                    alert("Please select a reason.");
                    return;
                }

                const currentStaffId = getActiveStaffID();
                const reportRef = doc(firestore, "Reports", report.docId);

                await updateDoc(reportRef, {
                    status: "Invalid",
                    History: {
                        closedOn: Timestamp.now(),
                        closedBy: currentStaffId,
                        reason: reason
                    }
                });

                writeLog("Edit", "Marked Report Invalid", report.reportID, `${report.reportID} marked invalid by ${currentStaffId} — Reason: ${reason}`);

                document.body.removeChild(popupContainer);
                modalContainer.innerHTML = '';
                // Note: No need to explicitly call fetchReports() because onSnapshot automatically updates the page!
            };
        }
    } catch (error) {
        console.error("Error opening Invalid popup:", error);
    }
}

async function openResolvePopup(report) {
    try {
        const response = await fetch('../Popups/Report_Resolved.html');
        const html = await response.text();

        const popupContainer = document.createElement('div');
        popupContainer.innerHTML = html;
        document.body.appendChild(popupContainer);

        const overlay = popupContainer.querySelector('#reportResolved');
        if (overlay) overlay.style.display = 'flex';

        const title = popupContainer.querySelector('.diatitle');
        if (title) title.textContent = `Resolve ${report.reportID || 'Report'}?`;

        const btnCancel = popupContainer.querySelector('.button.delete');
        const btnConfirm = popupContainer.querySelector('.button.confirm');
        const txtAction = popupContainer.querySelector('textarea.form-input');

        if (btnCancel) btnCancel.onclick = () => document.body.removeChild(popupContainer);

        if (btnConfirm) {
            btnConfirm.onclick = async () => {
                const actionText = txtAction?.value.trim() || '';
                if (!actionText) {
                    alert("Please provide the action taken.");
                    return;
                }

                const currentStaffId = getActiveStaffID();
                const reportRef = doc(firestore, "Reports", report.docId);

                await updateDoc(reportRef, {
                    status: "Resolved",
                    History: {
                        resolvedOn: Timestamp.now(),
                        resolvedBy: currentStaffId,
                        action: actionText
                    }
                });

                writeLog("Verify", "Resolved Report", report.reportID, `${report.reportID} resolved by ${currentStaffId} — ${actionText}`);

                document.body.removeChild(popupContainer);
                modalContainer.innerHTML = '';
                // Note: No need to explicitly call fetchReports() because onSnapshot automatically updates the page!
            };
        }
    } catch (error) {
        console.error("Error opening Resolve popup:", error);
    }
}

function setupExport() {
    document.querySelector('.btn.export')?.addEventListener('click', async (e) => {
        e.preventDefault();

        const categoryFilter = categorySelect?.value || 'All Reports';
        const statusFilter = statusSelect?.value || 'All';

        if (!(await confirmExport({ type: 'Reports', filters: [categoryFilter, statusFilter] }))) return;

        const matching = reportsData.filter(r => {
            const matchesCategory = categoryFilter === 'All Reports' || r.category === categoryFilter;
            let matchesStatus;
            if (statusFilter === 'All') matchesStatus = true;
            else if (statusFilter === 'Feedback') matchesStatus = r.category === 'Feedback';
            else matchesStatus = r.status === statusFilter;
            return matchesCategory && matchesStatus;
        });

        const rows = matching.map(r => {
            const d = r.createdOn && typeof r.createdOn.toDate === 'function' ? r.createdOn.toDate() : null;
            return [
                r.reportID || '', r.category || '', r.type || '', r.status || '',
                d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
                d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
                r.location || '', r.description || '',
                r.userName || '', r.userContact || '', r.userAddress || ''
            ];
        });

        await runWithLoading({
            loadingAction: 'Exporting Reports',
            loadingDescription: 'generate your CSV file',
            successAction: 'Export Successful',
            task: async () => {
                downloadCSV(
                    `reports_${todayStamp()}.csv`,
                    ['Report ID', 'Category', 'Type', 'Status', 'Date', 'Time', 'Location', 'Description', 'Reported By', 'Contact', 'Address'],
                    rows
                );
                return `${rows.length} report${rows.length === 1 ? '' : 's'} exported successfully`;
            }
        });
    });
}

function getActiveStaffID() {
    try {
        const rawData = sessionStorage.getItem("userData") || localStorage.getItem("userData") || "{}";
        const staffData = JSON.parse(rawData);
        return staffData.staffID || staffData.userID || "BFVS-26-00000";
    } catch (e) {
        return "BFVS-26-00000";
    }
}