import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBtbbHhSQ6ENXRSLmtuYaHmEsxy6MViw7A",
  authDomain: "agencia-juniors.firebaseapp.com",
  projectId: "agencia-juniors",
  storageBucket: "agencia-juniors.firebasestorage.app",
  messagingSenderId: "357728984172",
  appId: "1:357728984172:web:8fab3f2e64e372e755cc49",
  measurementId: "G-FECQYMBHMS"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);