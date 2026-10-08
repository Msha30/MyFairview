import { loginUser, auth, logout, getStaffProfile, loginState } from "./auth.js";
import { onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { showMessage, runWithLoading } from "./dialogs.js";

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

// ------------------------------------------------------------
// Forgot password — real reset email (replaces the old fake alert()s)
// ------------------------------------------------------------
const resetCard = document.getElementById("ITResetPassword");
const resetForm = document.getElementById("resetForm");
const resetEmailInput = document.getElementById("resetEmail");

function showCard(which) {
    loginCard?.classList.toggle("hidden", which !== "login");
    resetCard?.classList.toggle("hidden", which !== "reset");
}

document.getElementById("forgotLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (resetEmailInput) {
        resetEmailInput.value = emailInput?.value.trim() || ""; // carry over what they already typed
        resetEmailInput.focus();
    }
    showCard("reset");
});

document.getElementById("backToSignInBtn")?.addEventListener("click", () => showCard("login"));

function resetErrorMessage(err) {
    switch (err?.code) {
        case "auth/invalid-email":
            return "That email address doesn't look valid.";
        case "auth/too-many-requests":
            return "Too many requests. Please wait a few minutes and try again.";
        case "auth/network-request-failed":
            return "Couldn't reach the server. Please check your internet connection.";
        default:
            return "We couldn't send the reset email right now. Please try again.";
    }
}

let lastResetSentAt = 0;

async function sendReset() {
    const email = resetEmailInput?.value.trim() || "";
    if (!email) {
        await showMessage({ title: "Missing Email", type: "error", message: "Please enter your email address first." });
        return;
    }
    if (Date.now() - lastResetSentAt < 30000) {
        await showMessage({ title: "Please Wait", message: "A reset email was just sent. Check your inbox (and spam folder), or try again in a few seconds." });
        return;
    }

    const outcome = await runWithLoading({
        loadingAction: "Sending Reset Email",
        loadingDescription: "send the reset email",
        successAction: "Reset Email Sent",
        // Deliberately neutral: don't reveal whether the address has an account
        successDescription: `If ${email} has an account, a password reset link is on its way`,
        task: () => sendPasswordResetEmail(auth, email)
    });

    if (!outcome.ok) {
        console.error("Password reset error:", outcome.error);
        await showMessage({ title: "Couldn't Send Email", type: "error", message: resetErrorMessage(outcome.error) });
        return;
    }
    lastResetSentAt = Date.now();
}

resetForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    sendReset();
});

document.getElementById("resendLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    sendReset();
});