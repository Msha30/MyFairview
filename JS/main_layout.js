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
            
            // Targets elements inside userSection
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

// 4. Logout Action
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await logout();
    });
}

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
