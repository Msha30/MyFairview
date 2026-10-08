import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-analytics.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import { showMessage, showSuccess } from "./dialogs.js";

export const firebaseConfig = {
    apiKey: "AIzaSyADZ7D4nZfcHsWo1MDXgyjBU15xmuKMnIQ",
    authDomain: "myfairview-46d11.firebaseapp.com",
    projectId: "myfairview-46d11",
    databaseURL: "https://myfairview-46d11-default-rtdb.asia-southeast1.firebasedatabase.app",
    storageBucket: "myfairview-46d11.firebasestorage.app",
    messagingSenderId: "924890795291",
    appId: "1:924890795291:web:f5ea837dc50f575925d7be",
    measurementId: "G-6HLFPB18KQ"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const database = getDatabase(app);
export const analytics = getAnalytics(app);
export const storage = getStorage(app);

// Looks up a Firebase Auth uid in Info_Staff.
export async function getStaffProfile(uid) {
    const staffQuery = query(collection(firestore, "Info_Staff"), where("uid", "==", uid));
    const snap = await getDocs(staffQuery);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// login.js watches auth state too. While loginUser() is running it owns the
// redirect/sign-out decisions, so the success dialog isn't cut short.
export const loginState = { busy: false };

function loginErrorMessage(err) {
    switch (err.code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
        case "auth/invalid-email":
            return "Incorrect email or password. Please try again.";
        case "auth/user-not-found":
            return "No account found with this email. Please check and try again.";
        case "auth/user-disabled":
            return "This account has been disabled. Please contact a Super Admin.";
        case "auth/too-many-requests":
            return "Too many failed attempts. Please wait a few minutes and try again.";
        case "auth/network-request-failed":
            return "Couldn't reach the server. Please check your internet connection.";
        default:
            return "We couldn't sign you in right now. Please try again.";
    }
}

export async function loginUser(email, password) {
    loginState.busy = true;
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        // Only Info_Staff accounts may access this system. A valid Firebase Auth
        // login (e.g. a resident account) is not enough on its own.
        let staffData = null;
        try {
            staffData = await getStaffProfile(user.uid);
        } catch (err) {
            console.error("Error verifying staff account:", err);
        }

        if (!staffData) {
            await signOut(auth);
            sessionStorage.clear();
            loginState.busy = false;
            await showMessage({
                title: "Access Denied",
                type: "error",
                message: "This account isn't registered as barangay staff, so it can't access this system."
            });
            return;
        }

        sessionStorage.setItem("userData", JSON.stringify(staffData));

        const name = [staffData.fName, staffData.lName].filter(Boolean).join(" ").trim();
        await showSuccess({
            action: "Login Successful",
            description: name ? `Welcome back, ${name}` : "Welcome back",
            seconds: 2,
            countdownText: (n) => `Taking you to the dashboard in ${n}`,
            keepOpen: true // stay on screen until the page changes
        });
        window.location.href = "MainLayout.html";

    } catch (err) {
        loginState.busy = false;
        console.error("Login error:", err);
        await showMessage({
            title: "Login Failed",
            type: "error",
            message: loginErrorMessage(err)
        });
    }
}

export async function logout() {
    await signOut(auth);
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "index.html";
}