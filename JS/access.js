import { auth, firestore, firebaseConfig } from "./auth.js"; // Ensure firebaseConfig is exported from auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, doc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

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
            
            const row = `
                <tr class="tableRow">
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