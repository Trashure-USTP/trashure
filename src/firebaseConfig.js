// Please create a .env.local file in the root of your project
// and add your Firebase configuration there.
// Example:
// VITE_FIREBASE_CONFIG='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'
// VITE_APP_ID="trashure-proto"
// VITE_INITIAL_AUTH_TOKEN=""

const firebaseConfig = JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG || '{}');
export default firebaseConfig;
