import { firestore } from "./auth.js";
import { 
    doc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

let currentOpenedDocId = null; // Store the exact Firestore Document ID for updates

// Updated Helper for formatting Firestore Timestamps or JS Dates
function formatTimestamp(ts) {
    if (!ts) return "N/A";
    if (typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
    if (ts instanceof Date) {
        return ts.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
    // Fallback for string dates
    const d = new Date(ts);
    if (!isNaN(d)) return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return "N/A";
}

// Global function to open the modal & fetch data
window.openInfoCitizens = async function(identifier) {
    const modal = document.getElementById("infoCitizens");
    if (modal) modal.style.display = "flex";

    if (!identifier) return;

    // Reset Apply button state
    const applyBtn = document.getElementById("btn-apply-changes");
    if (applyBtn) {
        applyBtn.textContent = "Apply Changes";
        applyBtn.disabled = false;
    }

    try {
        let userSnap = null;
        let docId = null;

        // 1. Try fetching directly assuming identifier is Document ID (e.g., BFV-26-#####)
        const directDocRef = doc(firestore, "Info_User", identifier);
        const directSnap = await getDoc(directDocRef);

        if (directSnap.exists()) {
            userSnap = directSnap;
            docId = directSnap.id;
        } else {
            // 2. Fallback: Query where internal field "uid" matches identifier
            const qUid = query(collection(firestore, "Info_User"), where("uid", "==", identifier));
            let querySnap = await getDocs(qUid);

            // 3. Fallback: Query where internal field "userID" matches identifier
            if (querySnap.empty) {
                const qUserID = query(collection(firestore, "Info_User"), where("userID", "==", identifier));
                querySnap = await getDocs(qUserID);
            }

            if (!querySnap.empty) {
                userSnap = querySnap.docs[0];
                docId = userSnap.id;
            }
        }

        if (userSnap && userSnap.exists()) {
            currentOpenedDocId = docId; // Save the exact document ID for updating later
            const user = userSnap.data();

            // 1. Text Inputs (Left Column)
            document.getElementById("pop-lName").value = user.lName || "";
            document.getElementById("pop-fName").value = user.fName || "";
            document.getElementById("pop-mName").value = user.mName || "";
            document.getElementById("pop-suffix").value = user.suffix || "";
            document.getElementById("pop-contactMain").value = user.contactMain || "";
            document.getElementById("pop-contact2").value = user.contact2 || "";
            document.getElementById("pop-area").value = user.area || "";
            document.getElementById("pop-address").value = user.address || "";

            // 2. Dates
            document.getElementById("pop-birthdate").value = formatTimestamp(user.birthdate);
            document.getElementById("pop-regDate").textContent = formatTimestamp(user.regDate);

            // 3. User ID String
            document.getElementById("pop-userID").textContent = user.userID || "No ID";
            document.getElementById("pop-verifiedOn").textContent = formatTimestamp(user.verifiedOn);
            document.getElementById("pop-verifiedBy").textContent = user.verifiedBy || "N/A";
            document.getElementById("pop-rejectedOn").textContent = formatTimestamp(user.rejectedOn);
            document.getElementById("pop-rejectedBy").textContent = user.rejectedBy || "N/A";
            document.getElementById("pop-reason").textContent = user.reason || "N/A";

            // 4. Attachments
            const validIDBtn = document.getElementById("pop-validID");
            if (user.validID) {
                validIDBtn.textContent = "View ID File";
                validIDBtn.href = "#"; 
            } else {
                validIDBtn.textContent = "No File Attached";
                validIDBtn.removeAttribute("href");
            }

            const residencyBtn = document.getElementById("pop-residency");
            if (user.residency) {
                residencyBtn.textContent = "View Proof File";
                residencyBtn.href = "#"; 
            } else {
                residencyBtn.textContent = "No File Attached";
                residencyBtn.removeAttribute("href");
            }

            // 5. Format Status Badge & Verification Buttons
            const statusSpan = document.getElementById("pop-status");
            const statusStr = (user.status || "Unverified").toLowerCase();
            
            statusSpan.textContent = user.status || "Unverified";
            statusSpan.className = "status"; // Clear existing color classes
            
            if (statusStr === "verified") {
                statusSpan.classList.add("verified");
            } else if (statusStr === "invalid" || statusStr === "rejected") {
                statusSpan.classList.add("invalid");
            } else {
                statusSpan.classList.add("unverified");
            }

            // Trigger the UI manager (defaults to Read-Only mode)
            applyStatusUI(statusStr, false);
        } else {
            console.warn("No user found with document ID or UID:", identifier);
        }
    } catch (error) {
        console.error("Error fetching citizen info:", error);
    }
}

// Global function to apply and save changes to Firestore
window.applyCitizenChanges = async function() {
    if (!currentOpenedDocId) {
        console.error("No valid document ID loaded to update.");
        return;
    }

    const btn = document.getElementById("btn-apply-changes");
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
        const userRef = doc(firestore, "Info_User", currentOpenedDocId);
        
        // Grab values from the editable fields
        const updatedData = {
            contactMain: document.getElementById("pop-contactMain").value,
            contact2: document.getElementById("pop-contact2").value,
            area: document.getElementById("pop-area").value,
            address: document.getElementById("pop-address").value,
        };

        // Handle Date of Birth parsing
        const dobInput = document.getElementById("pop-birthdate").value;
        const parsedDob = new Date(dobInput);
        if (!isNaN(parsedDob.getTime())) {
            updatedData.birthdate = parsedDob; 
        }

        // Push updates to Firestore
        await updateDoc(userRef, updatedData);
        if (window.refreshCitizensTable) window.refreshCitizensTable();

        // Visual feedback
        btn.textContent = "Saved!";
        setTimeout(() => {
            btn.textContent = "Apply Changes";
            btn.disabled = false;
            
            // Exit edit mode and return to read-only verified state
            applyStatusUI("verified", false); 
        }, 2000);

    } catch (error) {
        console.error("Error saving edits:", error);
        btn.textContent = "Error Saving";
        btn.disabled = false;
    }
}

window.applyStatusUI = function(status, isEditing = false) {
    const btnEdit = document.getElementById("btn-edit-info");
    const btnSave = document.getElementById("btn-apply-changes");
    const divVerificationBtns = document.getElementById("pop-verification-btns");
    
    // Row elements
    const rowUserID = document.getElementById("row-userID");
    const rowVerifiedOn = document.getElementById("row-verifiedOn");
    const rowVerifiedBy = document.getElementById("row-verifiedBy");
    const rowRejectedOn = document.getElementById("row-rejectedOn");
    const rowRejectedBy = document.getElementById("row-rejectedBy");
    const rowReason = document.getElementById("row-reason");

    // All form inputs
    const inputs = [
        "pop-lName", "pop-fName", "pop-mName", "pop-suffix",
        "pop-contactMain", "pop-contact2", "pop-birthdate", "pop-area", "pop-address"
    ];

    // 1. Reset: Hide and disable everything initially
    if(btnEdit) btnEdit.style.display = "none";
    if(btnSave) btnSave.style.display = "none";
    if(divVerificationBtns) divVerificationBtns.style.display = "none";
    
    if(rowUserID) rowUserID.style.display = "none";
    if(rowVerifiedOn) rowVerifiedOn.style.display = "none";
    if(rowVerifiedBy) rowVerifiedBy.style.display = "none";
    if(rowRejectedOn) rowRejectedOn.style.display = "none";
    if(rowRejectedBy) rowRejectedBy.style.display = "none";
    if(rowReason) rowReason.style.display = "none";
    
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });

    // 2. Apply specific UI rules based on the status
    if (status === "unverified") {
        if(divVerificationBtns) divVerificationBtns.style.display = "flex";
    } 
    else if (status === "verified") {
        if(rowUserID) rowUserID.style.display = "flex";
        if(rowVerifiedOn) rowVerifiedOn.style.display = "flex";
        if(rowVerifiedBy) rowVerifiedBy.style.display = "flex";

        if (isEditing) {
            // EDITING MODE
            if(btnSave) btnSave.style.display = "block";
            inputs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = false; // Enable inputs
            });
        } else {
            // VERIFIED (Read-Only)
            if(btnEdit) btnEdit.style.display = "inline-block";
        }
    } 
    else if (status === "invalid" || status === "rejected") {
        if(rowRejectedOn) rowRejectedOn.style.display = "table-row";
        if(rowRejectedBy) rowRejectedBy.style.display = "table-row";
        if(rowReason) rowReason.style.display = "table-row";
    }
};

// Global handler for the Edit Button
window.toggleEditMode = function(event) {
    if (event) event.preventDefault();
    const statusSpan = document.getElementById("pop-status");
    const statusStr = (statusSpan.textContent || "Unverified").toLowerCase();
    
    // Switch to editing mode
    applyStatusUI(statusStr, true);
};

// Global function to close modal
window.closeInfoCitizens = function() {
    const modal = document.getElementById("infoCitizens");
    if (modal) modal.style.display = "none";
}

// Helper to inject the verification modals into the DOM on demand
async function ensureVerificationModalsLoaded() {
    if (!document.getElementById("userAccept")) {
        try {
            const res = await fetch("../Popups/User_Accept.html");
            if (res.ok) document.body.insertAdjacentHTML("beforeend", await res.text());
        } catch (e) { console.error(e); }
    }
    if (!document.getElementById("userInvalid")) {
        try {
            const res = await fetch("../Popups/User_Invalid.html");
            if (res.ok) document.body.insertAdjacentHTML("beforeend", await res.text());
        } catch (e) { console.error(e); }
    }
}

// Global click event handler for Modals and Verification Actions
document.addEventListener("click", async function (e) {
    const mainModal = document.getElementById("infoCitizens");
    
    // Close Main Info Modal
    if (mainModal && e.target === mainModal) window.closeInfoCitizens();

    // 1. Open Accept Modal
    if (e.target.id === "btn-verify-accept") {
        await ensureVerificationModalsLoaded();
        const acceptModal = document.getElementById("userAccept");
        if (acceptModal) {
            // Extract the user's name from the main info modal
            const fName = document.getElementById("pop-fName").value || "";
            const lName = document.getElementById("pop-lName").value || "";
            const fullName = `${fName} ${lName}`.trim() || "this user";
            
            // Inject into the dialog
            const nameEl = document.getElementById("accept-user-name");
            if (nameEl) nameEl.textContent = fullName;

            acceptModal.style.display = "flex";
        }
    }

    // 2. Open Reject Modal
    if (e.target.id === "btn-verify-reject") {
        await ensureVerificationModalsLoaded();
        const invalidModal = document.getElementById("userInvalid");
        if (invalidModal) {
            // Extract the user's name from the main info modal
            const fName = document.getElementById("pop-fName").value || "";
            const lName = document.getElementById("pop-lName").value || "";
            const fullName = `${fName} ${lName}`.trim() || "this user";
            
            // Inject into the dialog
            const nameEl = document.getElementById("reject-user-name");
            if (nameEl) nameEl.textContent = fullName;

            invalidModal.style.display = "flex";
        }
    }

    // 3. Close Accept Modal
    if (e.target.id === "btn-accept-cancel" || e.target.id === "userAccept") {
        document.getElementById("userAccept").style.display = "none";
    }

    // 4. Close Reject Modal
    if (e.target.id === "btn-invalid-cancel" || e.target.id === "userInvalid") {
        document.getElementById("userInvalid").style.display = "none";
    }

    // 5. Confirm Accept (Verify Account)
    if (e.target.id === "btn-accept-confirm") {
        if (!currentOpenedDocId) return;
        const btn = e.target;
        btn.textContent = "Verifying...";
        btn.disabled = true;

        try {
            // Generate a random ID (e.g. BFV-24-XXXX) if they don't have one
            let currentUserID = document.getElementById("pop-userID").textContent;
            let newUserID = currentUserID;
            if (!currentUserID || currentUserID === "No ID" || currentUserID === "Loading...") {
                const year = new Date().getFullYear().toString().slice(-2);
                const rand = Math.floor(1000 + Math.random() * 9000);
                newUserID = `BFV-${year}-${rand}`;
            }

            const userRef = doc(firestore, "Info_User", currentOpenedDocId);
            await updateDoc(userRef, {
                status: "Verified",
                verifiedOn: new Date(),
                verifiedBy: "Administrator", // Can be dynamically swapped for active admin session later
                userID: newUserID
            });
            
            document.getElementById("userAccept").style.display = "none";
            window.openInfoCitizens(currentOpenedDocId); // Refresh main popup UI
            if (window.refreshCitizensTable) window.refreshCitizensTable();
        } catch (error) {
            console.error("Error verifying user:", error);
        } finally {
            btn.textContent = "Confirm";
            btn.disabled = false;
        }
    }

    // 6. Confirm Reject (Invalidate Account)
    if (e.target.id === "btn-invalid-confirm") {
        if (!currentOpenedDocId) return;
        const btn = e.target;
        btn.textContent = "Rejecting...";
        btn.disabled = true;

        const reason = document.getElementById("invalid-reason-select").value;

        try {
            const userRef = doc(firestore, "Info_User", currentOpenedDocId);
            await updateDoc(userRef, {
                status: "Invalid",
                rejectedOn: new Date(),
                rejectedBy: "Administrator",
                reason: reason
            });
            
            document.getElementById("userInvalid").style.display = "none";
            window.openInfoCitizens(currentOpenedDocId); // Refresh main popup UI
            if (window.refreshCitizensTable) window.refreshCitizensTable();
        } catch (error) {
            console.error("Error rejecting user:", error);
        } finally {
            btn.textContent = "Confirm";
            btn.disabled = false;
        }
    }
});