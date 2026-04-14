import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";  
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

const firebaseConfig = {
    apiKey: "AIzaSyBnTP-6SDiJU5gjBx7OFfOiyczQLQjE_Xs",
    authDomain: "myfairview-46d11.firebaseapp.com",
    projectId: "myfairview-46d11",
    storageBucket: "myfairview-46d11.firebasestorage.app",
    messagingSenderId: "924890795291",
    appId: "1:924890795291:web:f5ea837dc50f575925d7be",
    measurementId: "G-6HLFPB18KQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const database = getDatabase(app);
const analytics = getAnalytics(app);

// ----- Login ----- // https://firebase.google.com/docs/auth/web/password-auth
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
    
// ----- Register ----- //
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
}

// ----- Logout ----- // https://firebase.google.com/docs/auth/web/manage-users#next-steps
export async function logout() {
    await signOut(auth);
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "Login.html";
}

window.logout = logout;
window.loginUser = loginUser;
window.registerUser = registerUser;