import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";  
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

export async function loginUser(email, password) {
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        const ref = doc(firestore, "Accounts", user.uid);
        const snap = await getDoc(ref);

        const data = snap.data();
        sessionStorage.setItem("userData", JSON.stringify(data));

        if (user) {
            alert("Login successful!");
            window.location.href = "MainLayout.html";
        } else {
            alert("Please verify your email before logging in.");
            await auth.signOut();
            return;
        }

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