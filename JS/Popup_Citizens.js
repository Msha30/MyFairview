import { firestore } from "./auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

let currentOpenedUid = null; // Track the currently viewed user

// Helper for formatting Firestore Timestamps
function formatTimestamp(ts) {
    if (ts && typeof ts.toDate === 'function') {
        return ts.toDate().toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric"
        });
    }
    return "N/A";
}

// Global function to open the modal & fetch data
window.openInfoCitizens = async function(uid) {
    const modal = document.getElementById("infoCitizens");
    if (modal) modal.style.display = "flex";

    if (!uid) return;
    currentOpenedUid = uid; // Store the UID so the save function knows who to update

    // Reset Apply button state just in case
    const applyBtn = document.getElementById("btn-apply-changes");
    if (applyBtn) {
        applyBtn.textContent = "Apply Changes";
        applyBtn.disabled = false;
    }

    try {
        const userRef = doc(firestore, "Info_User", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
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
            const verificationBtns = document.getElementById("pop-verification-btns");
            const statusStr = (user.status || "Unverified").toLowerCase();
            
            statusSpan.textContent = user.status || "Unverified";
            statusSpan.className = "status"; // Clear existing color classes
            
            // Logic for hiding/showing Accept/Reject buttons based on status
            if (statusStr === "verified") {
                statusSpan.classList.add("verified");
                if (verificationBtns) verificationBtns.style.display = "none";
            } else if (statusStr === "invalid" || statusStr === "rejected") {
                statusSpan.classList.add("invalid");
                if (verificationBtns) verificationBtns.style.display = "flex";
            } else {
                statusSpan.classList.add("unverified");
                if (verificationBtns) verificationBtns.style.display = "flex";
            }
        }
    } catch (error) {
        console.error("Error fetching citizen info:", error);
    }
}

// Global function to apply and save changes to Firestore
window.applyCitizenChanges = async function() {
    if (!currentOpenedUid) return;

    const btn = document.getElementById("btn-apply-changes");
    btn.textContent = "Saving...";
    btn.disabled = true;

    try {
        const userRef = doc(firestore, "Info_User", currentOpenedUid);
        
        // Grab values from the editable fields
        const updatedData = {
            contactMain: document.getElementById("pop-contactMain").value,
            contact2: document.getElementById("pop-contact2").value,
            area: document.getElementById("pop-area").value,
            address: document.getElementById("pop-address").value,
        };

        // Handle Date of Birth parsing 
        // Turns "March 30, 2005" back into a Date object so Firestore accepts it
        const dobInput = document.getElementById("pop-birthdate").value;
        const parsedDob = new Date(dobInput);
        if (!isNaN(parsedDob.getTime())) {
            updatedData.birthdate = parsedDob; 
        }

        // Push updates to Firestore
        await updateDoc(userRef, updatedData);

        // Visual feedback
        btn.textContent = "Saved!";
        setTimeout(() => {
            btn.textContent = "Apply Changes";
            btn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error("Error saving edits:", error);
        btn.textContent = "Error Saving";
        btn.disabled = false;
    }
}

// Global function to close modal
window.closeInfoCitizens = function() {
    const modal = document.getElementById("infoCitizens");
    if (modal) modal.style.display = "none";
}

// Close when clicking outside modal
document.addEventListener("click", function (e) {
    const modal = document.getElementById("infoCitizens");

    if (!modal) return;

    if (e.target === modal) {
        window.closeInfoCitizens();
    }
});