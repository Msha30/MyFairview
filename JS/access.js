import { auth, firestore, firebaseConfig } from "./auth.js"; // Ensure firebaseConfig is exported from auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

// 1. Initialize a Secondary App for Secure Account Creation
// Prevents the Super Admin from being logged out when creating a new staff member.
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

const popupContainer = document.getElementById("popup-container");

// 2. ID Generator Utility
function generateStaffID() {
    const year = new Date().getFullYear().toString().slice(-2);
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomNumber = (array[0] % 100000).toString().padStart(5, '0');
    return `BFVS-${year}-${randomNumber}`;
}

// 3. Helper: Converts checkbox states to Firestore strings
function determineAccessLevel(category) {
    // Finds all checkboxes starting with the category name (e.g., access-announcement-view)
    const checkboxes = document.querySelectorAll(`input[id^="access-${category}-"]`);
    if (checkboxes.length === 0) return "No Access";

    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    
    if (checked.length === checkboxes.length) return "All Access";
    if (checked.length === 0) return "No Access";
    if (checked.length === 1 && checked[0].id.includes("view")) return "Viewing Access";
    
    // If a mix is checked, combine their action names (e.g., "View, Create")
    return checked.map(cb => {
        const action = cb.id.split('-').pop(); // gets 'view', 'create', etc.
        return action.charAt(0).toUpperCase() + action.slice(1);
    }).join(", ");
}

// 4. Load Staff into Table
async function loadStaffTable() {
    const tbody = document.querySelector(".tableDiv.members tbody");
    if (!tbody) return;
    
    tbody.innerHTML = ""; // Clear placeholder rows

    try {
        const querySnapshot = await getDocs(collection(firestore, "Info_Staff"));
        
        querySnapshot.forEach((docSnap) => {
            const staff = docSnap.data();
            const mNameInitial = staff.mName ? staff.mName.charAt(0) + '.' : '';
            const fullName = `${staff.lName}, ${staff.fName} ${mNameInitial}`.trim();
            
            // Added data-id to the tr and an inline pointer cursor for UX
            const row = `
                <tr class="tableRow" data-id="${staff.staffID}" style="cursor: pointer;">
                    <td class="user-section">
                        <div class="user-avatar ${staff.role === 'Super Admin' ? 'super' : (staff.role ? 'admin' : 'none')}">
                            ${staff.fName.charAt(0)}${staff.lName.charAt(0)}
                        </div>
                        <div class="user-info">
                            <strong>${fullName}</strong><br>
                            <span>${staff.role || "Staff"}</span>
                        </div>
                    </td>
                    <td>${staff.staffID}</td>
                    <td>${staff.p_access || "No Access"}</td>
                    <td><a class="btn edit" href="#" data-id="${staff.staffID}">Edit</a></td>
                </tr>
            `;
            tbody.insertAdjacentHTML("beforeend", row);
        });

        // ROW CLICK -> Open in View Mode
        const rows = tbody.querySelectorAll(".tableRow");
        rows.forEach(row => {
            row.addEventListener("click", (e) => {
                // Prevent row click if the user specifically clicked the 'Edit' button
                if (e.target.classList.contains("edit")) return;
                
                const staffID = row.getAttribute("data-id");
                openStaffModal(staffID, false); // false = View Mode
            });
        });

        // EDIT BUTTON CLICK -> Open in Edit Mode
        const editButtons = tbody.querySelectorAll(".btn.edit");
        editButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation(); // Stops the row click event from firing simultaneously
                const staffID = e.target.getAttribute("data-id");
                openStaffModal(staffID, true); // true = Edit Mode
            });
        });

    } catch (err) {
        console.error("Error loading staff table:", err);
    }
}

// 5. Secure Staff Creation Logic
async function submitNewStaff() {
    const email = document.getElementById("add-email").value;
    const password = document.getElementById("add-password").value;
    
    if (!email || !password) {
        alert("Email and password are required.");
        return;
    }
    
    try {
        // Create user on the SECONDARY auth instance
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const newUser = userCred.user;
        const newStaffID = generateStaffID();

        // Build Payload using the IDs from your Add_Staff.html
        const staffData = {
            uid: newUser.uid,
            staffID: newStaffID,
            email: email,
            fName: document.getElementById("add-fName").value,
            lName: document.getElementById("add-lName").value,
            mName: document.getElementById("add-mName").value || "",
            suffix: document.getElementById("add-suffix").value || "",
            birthDate: document.getElementById("add-dob").value,
            contact: document.getElementById("add-contact").value,
            address: document.getElementById("add-address").value,
            role: document.getElementById("add-position").value,
            
            // Dynamically map checkboxes to strings
            p_announcement: determineAccessLevel("announcement"),
            p_citizens: determineAccessLevel("citizens"),
            p_vehicles: determineAccessLevel("vehicles"),
            p_reports: determineAccessLevel("reports"),
            p_waterLevel: determineAccessLevel("water"),
            p_evacPlan: determineAccessLevel("evacuation"),
            p_access: determineAccessLevel("management")
        };

        // Save to Firestore using StaffID as the document key
        await setDoc(doc(firestore, "Info_Staff", newStaffID), staffData);

        // Sign out the secondary instance to clean up
        await secondaryAuth.signOut();

        alert("Staff member successfully added!");
        closeModal();
        loadStaffTable(); // Refresh the table automatically
    } catch (error) {
        console.error("Error creating staff:", error);
        alert("Error: " + error.message);
    }
}

// 6. Modal Management
async function openAddModal() {
    try {
        // Fetch HTML template
        const response = await fetch('../Popups/Add_Staff.html'); // Ensure this matches your exact filename
        const html = await response.text();
        popupContainer.innerHTML = html;
        
        // Show Modal 
        popupContainer.classList.remove("hidden");
        const overlay = document.querySelector(".modal-overlay");
        if (overlay) overlay.style.display = "flex"; 

        // Attach listeners to the newly injected buttons
        document.querySelector(".button.confirm").addEventListener("click", submitNewStaff);
        document.querySelector(".button.delete").addEventListener("click", closeModal);
    } catch (err) {
        console.error("Error loading Add_Staff modal:", err);
    }
}

function closeModal() {
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.style.display = "none";
    popupContainer.innerHTML = "";
}

// 7. Initialization
document.addEventListener("DOMContentLoaded", () => {
    // Attach event to the "Add Member" button in Access.html
    const addBtn = document.querySelector(".btn.add");
    if (addBtn) {
        addBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openAddModal();
        });
    }

    // Load initial table data
    loadStaffTable();
});

// 8. Open Staff Modal (Handles both View and Edit modes)
async function openStaffModal(staffID, isEditMode = false) {
    try {
        const response = await fetch('../Popups/Info_Staff.html');
        const html = await response.text();
        popupContainer.innerHTML = html;
        
        popupContainer.classList.remove("hidden");
        const overlay = document.querySelector(".modal-overlay");
        if (overlay) {
            overlay.style.display = "flex";
            // Close modal when clicking outside the popup content
            overlay.addEventListener("click", (e) => {
                if(e.target === overlay) closeModal();
            });
        }

        // Fetch staff data from Firestore
        const staffDoc = await getDoc(doc(firestore, "Info_Staff", staffID));
        if (!staffDoc.exists()) {
            alert("Staff member not found.");
            return;
        }
        
        const staff = staffDoc.data();

        // Populate Text Fields
        document.getElementById("edit-position").value = staff.role || "";
        document.getElementById("edit-lName").value = staff.lName || "";
        document.getElementById("edit-fName").value = staff.fName || "";
        document.getElementById("edit-mName").value = staff.mName || "";
        document.getElementById("edit-suffix").value = staff.suffix || "";
        document.getElementById("edit-contact").value = staff.contact || "";
        document.getElementById("edit-dob").value = staff.birthDate || "";
        document.getElementById("edit-email").value = staff.email || "";
        document.getElementById("edit-address").value = staff.address || "";
        document.getElementById("display-staffID").innerText = staff.staffID || "";

        // Populate Checkboxes
        setEditCheckboxes("announcement", staff.p_announcement);
        setEditCheckboxes("citizens", staff.p_citizens);
        setEditCheckboxes("vehicles", staff.p_vehicles);
        setEditCheckboxes("reports", staff.p_reports);
        setEditCheckboxes("water", staff.p_waterLevel);
        setEditCheckboxes("evacuation", staff.p_evacPlan);
        setEditCheckboxes("management", staff.p_access);

        // --- View vs Edit Mode Logic ---
        if (!isEditMode) {
            // VIEW MODE: Make text read-only, disable checkboxes, and hide action buttons
            const allInputs = document.querySelectorAll('#staffModal input');
            allInputs.forEach(input => {
                if (input.type === 'checkbox') {
                    input.disabled = true;
                } else {
                    input.readOnly = true; 
                    input.style.cursor = 'default';
                }
            });
            
            // Hide "Apply Changes" and "Remove Staff" buttons
            const actionButtons = document.querySelector('#staffModal .buttons');
            if (actionButtons) actionButtons.style.display = 'none';
        } else {
            // EDIT MODE: Attach Button Listeners
            document.querySelector(".button.accept").addEventListener("click", () => saveStaffChanges(staffID));
            document.querySelector(".button.delete").addEventListener("click", () => removeStaff(staffID));
        }

    } catch (err) {
        console.error("Error opening modal:", err);
    }
}

// 9. Save Staff Changes
async function saveStaffChanges(staffID) {
    try {
        const updatedData = {
            role: document.getElementById("edit-position").value,
            lName: document.getElementById("edit-lName").value,
            fName: document.getElementById("edit-fName").value,
            mName: document.getElementById("edit-mName").value,
            suffix: document.getElementById("edit-suffix").value,
            contact: document.getElementById("edit-contact").value,
            birthDate: document.getElementById("edit-dob").value,
            address: document.getElementById("edit-address").value,
            
            p_announcement: determineEditAccessLevel("announcement"),
            p_citizens: determineEditAccessLevel("citizens"),
            p_vehicles: determineEditAccessLevel("vehicles"),
            p_reports: determineEditAccessLevel("reports"),
            p_waterLevel: determineEditAccessLevel("water"),
            p_evacPlan: determineEditAccessLevel("evacuation"),
            p_access: determineEditAccessLevel("management")
        };

        await updateDoc(doc(firestore, "Info_Staff", staffID), updatedData);
        alert("Changes applied successfully!");
        closeModal();
        loadStaffTable(); // Refresh table automatically
    } catch (error) {
        console.error("Error updating staff:", error);
        alert("Failed to update staff.");
    }
}

// 10. Remove Staff
async function removeStaff(staffID) {
    if(!confirm("Are you sure you want to permanently remove this staff member's access?")) return;
    try {
        await deleteDoc(doc(firestore, "Info_Staff", staffID));
        alert("Staff member removed successfully.");
        closeModal();
        loadStaffTable();
    } catch (error) {
        console.error("Error deleting staff:", error);
        alert("Failed to delete staff.");
    }
}

// Helper: Checks the boxes based on the Firestore string data
function setEditCheckboxes(category, accessString) {
    if (!accessString || accessString === "No Access") return;
    const checkboxes = document.querySelectorAll(`input[id^="edit-access-${category}-"]`);
    
    if (accessString === "All Access") {
        checkboxes.forEach(cb => cb.checked = true);
        return;
    }
    if (accessString === "Viewing Access") {
        const viewCb = document.getElementById(`edit-access-${category}-view`);
        if (viewCb) viewCb.checked = true;
        return;
    }
    
    // Parse combined actions (e.g., "View, Create")
    const actions = accessString.split(",").map(a => a.trim().toLowerCase());
    checkboxes.forEach(cb => {
        const action = cb.id.split('-').pop(); // gets 'view', 'create', etc.
        if (actions.includes(action)) {
            cb.checked = true;
        }
    });
}

// Helper: Converts checkbox states back to strings (specific to the edit modal IDs)
function determineEditAccessLevel(category) {
    const checkboxes = document.querySelectorAll(`input[id^="edit-access-${category}-"]`);
    if (checkboxes.length === 0) return "No Access";

    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    if (checked.length === checkboxes.length) return "All Access";
    if (checked.length === 0) return "No Access";
    if (checked.length === 1 && checked[0].id.includes("view")) return "Viewing Access";
    
    return checked.map(cb => {
        const action = cb.id.split('-').pop();
        return action.charAt(0).toUpperCase() + action.slice(1);
    }).join(", ");
}