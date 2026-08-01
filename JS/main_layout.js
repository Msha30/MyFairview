import { auth, logout } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

const userSection = document.getElementById("userSection");
const userDropdown = document.getElementById("userDropdown");
const logoutBtn = document.getElementById("logoutBtn");

// Parse URL parameters when MainLayout loads
const urlParams = new URLSearchParams(window.location.search);
const requestedPage = urlParams.get("page");

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("index.html");
    }
});

if (requestedPage) {
    const iframe = document.getElementById("contentFrame");
    if (iframe) {
        iframe.src = `MainPages/${requestedPage}`;
    }
}

// 1. Toggle dropdown when clicking user profile
if (userSection && userDropdown) {
    userSection.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevents click from immediately reaching document
        userDropdown.classList.toggle("hidden");
    });

    // 2. Close dropdown automatically if user clicks anywhere outside
    document.addEventListener("click", (e) => {
        if (!userDropdown.contains(e.target) && !userSection.contains(e.target)) {
            userDropdown.classList.add("hidden");
        }
    });
}

// 3. Attach logout functionality
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
