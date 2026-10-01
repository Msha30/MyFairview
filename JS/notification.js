// notifications.js
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { app } from "./auth.js"; // Ensures Firebase is initialized

const firestore = getFirestore(app);

export async function sendAppNotification(title, body, topicKey) {
    try {
        await addDoc(collection(firestore, "Notifications"), {
            title: title,
            body: body,
            topic: `topic_${topicKey}`,
            sentAt: serverTimestamp(),
            status: "Pending" // Cloud Function updates this to "Sent"
        });
        console.log(`Notification queued for topic_${topicKey}`);
    } catch (error) {
        console.error("Failed to send notification:", error);
    }
}