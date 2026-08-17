import { auth, firestore, logout } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const userSection = document.getElementById("userSection");
const userDropdown = document.getElementById("userDropdown");
const logoutBtn = document.getElementById("logoutBtn");

// 1. Auth Guard & Profile Fetcher
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("index.html");
        return;
    }

    // Fetch user details from Firestore Info_Staff collection
    try {
        const staffRef = collection(firestore, "Info_Staff");
        const q = query(staffRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            const userNameEl = document.querySelector(".user-name") || document.getElementById("userName");
            const userRoleEl = document.querySelector(".user-role") || document.getElementById("userRole");

            const fullName = `${userData.fName || ""} ${userData.lName || ""}`.trim() || "Administrator";

            if (userNameEl) userNameEl.textContent = fullName;
            if (userRoleEl) userRoleEl.textContent = userData.role || "Staff";
        }
    } catch (err) {
        console.error("Error fetching staff profile:", err);
    }
});

// 2. Parse URL parameters for iframe navigation
const urlParams = new URLSearchParams(window.location.search);
const requestedPage = urlParams.get("page");

if (requestedPage) {
    const iframe = document.getElementById("contentFrame");
    if (iframe) {
        iframe.src = `MainPages/${requestedPage}`;
    }
}

// 3. User Dropdown Toggle
if (userSection && userDropdown) {
    userSection.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
        if (!userDropdown.contains(e.target) && !userSection.contains(e.target)) {
            userDropdown.classList.add("hidden");
        }
    });
}

// 4. Fetch and inject Dialog_Logout.html on page load
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Adjust path if Dialog_Logout.html is in a subfolder (e.g., "Popups/Dialog_Logout.html")
        const response = await fetch("Popups/Dialog_Logout.html");
        if (response.ok) {
            const html = await response.text();
            const container = document.getElementById("popup-container");
            if (container) {
                container.innerHTML = html;
            }
        } else {
            console.error("Failed to load Dialog_Logout.html");
        }
    } catch (err) {
        console.error("Error loading logout dialog:", err);
    }
});

// 5. Logout Action - Open Modal instead of logging out directly
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (userDropdown) {
            userDropdown.classList.add("hidden");
        }

        const dialogLogout = document.getElementById("dialogLogout");
        if (dialogLogout) {
            dialogLogout.style.display = "flex";
        }
    });
}

// 6. Handle Modal Actions (Cancel, Confirm Logout, Outside Click) via Event Delegation
document.addEventListener("click", async (e) => {
    const dialogLogout = document.getElementById("dialogLogout");
    if (!dialogLogout) return;

    // Close modal if clicking "Cancel" or clicking the dark background overlay
    if (e.target.id === "cancelLogoutBtn" || e.target === dialogLogout) {
        dialogLogout.style.display = "none";
    }

    // Execute logout when confirming
    if (e.target.id === "confirmLogoutBtn") {
        const confirmBtn = e.target;
        confirmBtn.textContent = "Logging out...";
        confirmBtn.disabled = true;
        await logout();
    }
});

// 7. Live Alert Timestamp
function updateLiveTime() {
    const timeEl = document.getElementById("currentTime");
    if (!timeEl) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
    const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });

    timeEl.textContent = `${dateStr} · ${timeStr}`;
}

updateLiveTime();
setInterval(updateLiveTime, 1000);

/*
export async function registerUser(fullname, email, password) {
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        // Store user profile in Firestore
        const userProfile = {
            fullname: fullname,
            email: email,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(firestore, "Accounts", user.uid), userProfile);

        // Store user data in sessionStorage
        sessionStorage.setItem("userData", JSON.stringify(userProfile));

        alert("Registration successful!");
        window.location.href = "MainLayout.html";
    } catch (err) {
        alert(err.message);
        console.error("Registration error:", err);
    }
}*/
