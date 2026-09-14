import { firestore } from './auth.js'; 
import { collection, getDocs, doc, getDoc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js"; 
import { initCardMap } from "./gmapComponent.js"; 

let reportsData = [];
const tableBody = document.querySelector('.tableDiv.reports tbody');
const modalContainer = document.getElementById('modal-container');

// DOM Elements for Filtering
const searchInput = document.getElementById('search');
const categorySelect = document.querySelector('#report_sort select');
const statusSelect = document.querySelector('#status_sort select');

// DOM Elements for Stats
const btnUnresolved = document.getElementById('unresolved_btn');
const btnResolved = document.getElementById('resolved_btn');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await fetchReports();
    setupEventListeners();
    applyFilters();
    updateStats('Unresolved');
}

async function fetchReports() {
    try {
        const querySnapshot = await getDocs(collection(firestore, "Reports"));
        reportsData = [];
        
        for (const documentSnapshot of querySnapshot.docs) {
            const data = documentSnapshot.data();
            let userName = data.createdBy || "Resident";
            let userContact = "N/A";
            let userAddress = "N/A";
            
            // Fetch User Contact & Details based on createdBy ID
            if (data.createdBy) {
                try {
                    const userRef = doc(firestore, "Info_User", data.createdBy);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        userName = `${userData.fName || ''} ${userData.lName || ''}`.trim();
                        userContact = userData.contactMain || "N/A";
                        userAddress = userData.address || "N/A";
                    }
                } catch (e) {
                    console.error("Error fetching user data:", e);
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
        console.error("Error fetching reports: ", error);
    }
}

function setupEventListeners() {
    searchInput.addEventListener('input', applyFilters);
    categorySelect.addEventListener('change', applyFilters);
    statusSelect.addEventListener('change', applyFilters);

    btnUnresolved.addEventListener('click', () => {
        setStatTab('Unresolved');
        statusSelect.value = 'Unresolved';
        applyFilters();
    });

    btnResolved.addEventListener('click', () => {
        setStatTab('Resolved');
        statusSelect.value = 'Resolved';
        applyFilters();
    });

    document.querySelector('.btn.map').addEventListener('click', openMapModal);
}

function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value;
    const statusFilter = statusSelect.value;

    const filtered = reportsData.filter(report => {
        const matchesSearch = report.description?.toLowerCase().includes(searchTerm) || 
                              report.reportID?.toLowerCase().includes(searchTerm) ||
                              report.location?.toLowerCase().includes(searchTerm);
        
        const matchesCategory = categoryFilter === 'All Reports' || report.category === categoryFilter;
        
        // NEW: Handle 'All' and 'Feedback' logic specifically
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

function renderTable(data) {
    tableBody.innerHTML = ''; 

    data.forEach(report => {
        const dateObj = report.createdOn ? report.createdOn.toDate() : new Date();
        const dateString = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeString = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        const tr = document.createElement('tr');
        const rowClass = report.category ? report.category.toLowerCase().replace(' ', '') : 'community';
        tr.className = `tableRow ${rowClass}`;
        
        tr.innerHTML = `
            <td class="user-section">
                <div class="dot">●</div>
                <div class="user-info">
                    <strong>${report.reportID || 'N/A'} | ${report.type || 'N/A'}</strong><br>
                    <span>${dateString} · ${timeString}</span>
                </div>
            </td>
            <td class="location">${report.location || 'N/A'}</td>
            <td>${report.userName}</td>
            <td>${report.userContact}</td>
        `;

        tr.addEventListener('click', () => openInfoModal(report, dateString, timeString));
        tableBody.appendChild(tr);
    });
}

function setStatTab(status) {
    if(status === 'Unresolved') {
        btnUnresolved.className = 'btn active';
        btnResolved.className = 'btn inactive';
    } else {
        btnUnresolved.className = 'btn inactive';
        btnResolved.className = 'btn active';
    }
    updateStats(status);
}

function updateStats(statusFilter) {
    // NEW: Handle 'All' and 'Feedback' logic specifically to calculate stats accurately
    const relevantReports = reportsData.filter(r => {
        if (statusFilter === 'All') return true;
        if (statusFilter === 'Feedback') return r.category === 'Feedback';
        return r.status === statusFilter;
    });
    
    const counts = {
        'Emergency': 0,
        'Public Safety': 0,
        'Community': 0,
        'Feedback': 0
    };

    relevantReports.forEach(r => {
        if (counts[r.category] !== undefined) counts[r.category]++;
    });

    const statVals = document.querySelectorAll('.stat-val');
    if(statVals.length >= 4) {
        statVals[0].textContent = counts['Emergency'];
        statVals[1].textContent = counts['Public Safety'];
        statVals[2].textContent = counts['Community'];
        statVals[3].textContent = counts['Feedback'];
    }
}

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
                if (rows[index]) {
                    const cells = rows[index].querySelectorAll('td');
                    if (cells.length > 1) {
                        cells[1].textContent = value;
                    }
                }
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
        
        if (!isFeedback) {
            // ═══════════════════════════════════════════════════════════════
            // ════════════════ BUTTON & STATUS CARD LOGIC ═══════════════════
            // ═══════════════════════════════════════════════════════════════
            const actionButtons = modalContainer.querySelector('#actionButtons');
            const resolvedCard = modalContainer.querySelector('#resolvedCard');
            const invalidCard = modalContainer.querySelector('#invalidCard');
            
            if (actionButtons && resolvedCard && invalidCard) {
                if (report.status === 'Resolved') {
                    actionButtons.style.display = 'none';
                    resolvedCard.style.display = 'block';
                    invalidCard.style.display = 'none'; 
                    
                    const resDate = report.History?.resolvedOn ? report.History.resolvedOn.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A';
                    modalContainer.querySelector('#resOn').textContent = resDate;
                    modalContainer.querySelector('#resBy').textContent = report.History?.resolvedBy || 'N/A';
                    modalContainer.querySelector('#resAction').textContent = report.History?.action || 'N/A';
                    
                } else if (report.status === 'Invalid') {
                    actionButtons.style.display = 'none';
                    invalidCard.style.display = 'block';
                    resolvedCard.style.display = 'none'; 

                    const invDate = report.History?.closedOn ? report.History.closedOn.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'N/A';
                    modalContainer.querySelector('#invOn').textContent = invDate;
                    modalContainer.querySelector('#invBy').textContent = report.History?.closedBy || 'N/A';
                    modalContainer.querySelector('#invReason').textContent = report.History?.reason || 'N/A';
                    
                } else {
                    actionButtons.style.display = 'flex'; 
                    resolvedCard.style.display = 'none';
                    invalidCard.style.display = 'none';

                    const btnInvalid = modalContainer.querySelector('#btnInvalid');
                    const btnResolve = modalContainer.querySelector('#btnResolve');
                    
                    if(btnInvalid) btnInvalid.onclick = () => openInvalidPopup(report);
                    if(btnResolve) btnResolve.onclick = () => openResolvePopup(report);
                }
            } else {
                console.error("DOM Error: Could not find #actionButtons, #resolvedCard, or #invalidCard in the injected HTML.");
            }

            // ═══════════════════════════════════════════════════════════════
            // ════════════════ POPULATE HISTORY TIMELINE ════════════════════
            // ═══════════════════════════════════════════════════════════════
            const historyList = modalContainer.querySelector('.history-list');
            if (historyList) {
                historyList.innerHTML = ''; 

                const createdItem = document.createElement('div');
                createdItem.className = 'history-item';
                createdItem.innerHTML = `
                    <div class="title">${report.reportID || 'N/A'} | Created</div>
                    <div class="desc">Report submitted by ${report.userName}</div>
                    <div class="meta">
                        <span>${dateStr} · ${timeStr}</span>
                        <span>Unresolved</span>
                    </div>
                `;
                historyList.appendChild(createdItem);

                if (report.status === 'Resolved' && report.History?.resolvedOn) {
                    const resDate = report.History.resolvedOn.toDate();
                    const resDateStr = resDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const resTimeStr = resDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                    const resolvedItem = document.createElement('div');
                    resolvedItem.className = 'history-item';
                    resolvedItem.innerHTML = `
                        <div class="title">${report.reportID || 'N/A'} | Resolved</div>
                        <div class="desc">Action taken: ${report.History.action || 'N/A'}</div>
                        <div class="meta">
                            <span>${resDateStr} · ${resTimeStr}</span>
                            <span>Resolved</span>
                        </div>
                    `;
                    historyList.prepend(resolvedItem); 

                } else if (report.status === 'Invalid' && report.History?.closedOn) {
                    const invDate = report.History.closedOn.toDate();
                    const invDateStr = invDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const invTimeStr = invDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                    const invalidItem = document.createElement('div');
                    invalidItem.className = 'history-item';
                    invalidItem.innerHTML = `
                        <div class="title">${report.reportID || 'N/A'} | Closed as Invalid</div>
                        <div class="desc">Reason: ${report.History.reason || 'N/A'}</div>
                        <div class="meta">
                            <span>${invDateStr} · ${invTimeStr}</span>
                            <span>Invalid</span>
                        </div>
                    `;
                    historyList.prepend(invalidItem);
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

async function openMapModal() {
    try {
        const response = await fetch('../Popups/Reports_Map.html');
        const html = await response.text();
        modalContainer.innerHTML = html;

        const reportsCenter = { lat: 14.7391, lng: 121.0532 }; 
        
        const reportMarkers = reportsData
            // NEW: Filter out Resolved reports and Feedback before mapping
            .filter(report => report.status !== 'Resolved' && report.category !== 'Feedback')
            .map(report => {
                if (!report.pinLocation) return null;

                let lat, lng;
                if (typeof report.pinLocation.latitude !== 'undefined') {
                    lat = report.pinLocation.latitude;
                    lng = report.pinLocation.longitude;
                } else if (typeof report.pinLocation.lat !== 'undefined') {
                    lat = parseFloat(report.pinLocation.lat);
                    lng = parseFloat(report.pinLocation.lng);
                }

                if (lat && lng) {
                    return {
                        lat: lat,
                        lng: lng,
                        title: `${report.reportID || 'ID'} | ${report.type || 'Type'}`,
                        snippet: `Status: ${report.status || 'Unknown'}`
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

// ═══════════════════════════════════════════════════════════════
// ════════════════ SUB-MODAL LOGIC ══════════════════════════════
// ═══════════════════════════════════════════════════════════════

async function openInvalidPopup(report) {
    try {
        const response = await fetch('../Popups/Report_Invalid.html');
        const html = await response.text();
        
        // Stack popup over existing model
        const popupContainer = document.createElement('div');
        popupContainer.innerHTML = html;
        document.body.appendChild(popupContainer);
        
        const overlay = popupContainer.querySelector('#reportInvalid');
        if (overlay) overlay.style.display = 'flex';
        
        // Dynamically update reference text
        const title = popupContainer.querySelector('.diatitle');
        if (title) title.textContent = `Close ${report.reportID || 'Report'}?`;
        
        const btnCancel = popupContainer.querySelector('.button.delete');
        const btnConfirm = popupContainer.querySelector('.button.confirm');
        const selectReason = popupContainer.querySelector('.form-select');
        
        btnCancel.onclick = () => document.body.removeChild(popupContainer);
        
        btnConfirm.onclick = async () => {
            const reason = selectReason.value;
            
            // Extract Logged in Staff ID from sessionStorage
            const staffData = JSON.parse(sessionStorage.getItem("userData") || "{}");
            const currentStaffId = staffData.staffID || 'Unknown Staff';
            
            // Write to Firestore history properties as a nested Map
            const reportRef = doc(firestore, "Reports", report.docId);
            await updateDoc(reportRef, {
                status: "Invalid",
                History: {
                    closedOn: Timestamp.now(),
                    closedBy: currentStaffId,
                    reason: reason
                }
            });
            
            // Cleanup and reload data view
            document.body.removeChild(popupContainer);
            modalContainer.innerHTML = '';
            await fetchReports();
            applyFilters();
            // Assuming statusSelect is still globally available in your script
            updateStats(document.querySelector('#status_sort select').value);
        };
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
        
        btnCancel.onclick = () => document.body.removeChild(popupContainer);
        
        btnConfirm.onclick = async () => {
            const actionText = txtAction.value.trim();
            if (!actionText) {
                alert("Please provide the action taken.");
                return;
            }
            
            // Extract Logged in Staff ID from sessionStorage
            const staffData = JSON.parse(sessionStorage.getItem("userData") || "{}");
            const currentStaffId = staffData.staffID || 'Unknown Staff';
            
            // Write to Firestore history properties as a nested Map
            const reportRef = doc(firestore, "Reports", report.docId);
            await updateDoc(reportRef, {
                status: "Resolved",
                History: {
                    resolvedOn: Timestamp.now(),
                    resolvedBy: currentStaffId,
                    action: actionText
                }
            });
            
            document.body.removeChild(popupContainer);
            modalContainer.innerHTML = '';
            await fetchReports();
            applyFilters();
            // Assuming statusSelect is still globally available in your script
            updateStats(document.querySelector('#status_sort select').value);
        };
    } catch (error) {
        console.error("Error opening Resolve popup:", error);
    }
}