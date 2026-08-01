import { loginUser, auth } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";

const loginCard = document.getElementById("ITLogIn");

onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.replace("MainLayout.html");
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

        await loginUser(email, password);
    });
}
   