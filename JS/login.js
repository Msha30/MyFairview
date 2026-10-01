import { loginUser, auth, logout, getStaffProfile, loginState } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { showMessage } from "./dialog.js";

const loginCard = document.getElementById("ITLogIn");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // loginUser() is mid-login and will show its own dialog + redirect.
        if (loginState.busy) return;

        // Being signed in to Firebase Auth isn't enough — only redirect if this
        // uid is a registered Info_Staff account. Handles both a stale session
        // from a non-staff account, and the brief window right after sign-in
        // before loginUser's own staff check has finished.
        let staffData = null;
        try {
            staffData = await getStaffProfile(user.uid);
        } catch (err) {
            console.error("Error verifying staff account:", err);
        }

        if (staffData) {
            window.location.replace("MainLayout.html");
        } else {
            await logout();
        }
    } else {
        if (loginCard) {
            loginCard.classList.remove("login-container");
        }
    }
});

const loginForm = document.querySelector("#loginForm");
const emailInput = document.querySelector("#loginId");
const passwordInput = document.getElementById("loginPassword");

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            await showMessage({
                title: "Missing Details",
                type: "error",
                message: "Please enter both your email and password."
            });
            return;
        }

        // Stop double-submits while Firebase is thinking
        const submitBtn = loginForm.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (submitBtn) submitBtn.disabled = true;
        try {
            await loginUser(email, password);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}