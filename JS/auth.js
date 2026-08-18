import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-analytics.js";

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

// Looks up a Firebase Auth uid in Info_Staff. Returns the staff doc's data
// (with its Firestore doc id attached) if found, or null if this uid is not
// a registered staff account — e.g. a resident/Info_User account, or an
// orphaned Auth user with no staff record at all.
export async function getStaffProfile(uid) {
    const staffQuery = query(collection(firestore, "Info_Staff"), where("uid", "==", uid));
    const snap = await getDocs(staffQuery);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function loginUser(email, password) {
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
            alert("This account isn't registered as barangay staff, so it can't access this system.");
            return;
        }

        sessionStorage.setItem("userData", JSON.stringify(staffData));
        alert("Login successful!");
        window.location.href = "MainLayout.html";

    } catch (err) {
        if (err.code === "auth/wrong-password" || err.code === "auth/invalid-email") {
            alert("Incorrect password or email. Please try again.");
        } 
        else if (err.code === "auth/user-not-found") {
            alert("No account found with this email. Please check and try again.");
        } 
        else {
            alert(err.message);
            console.error("Login error:", err);
        }
    }
}

export async function logout() {
    await signOut(auth);
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "index.html";
}