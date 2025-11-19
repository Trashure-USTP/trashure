import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { 
  getDatabase,
  ref,
  set,
  onValue,
  push,
  serverTimestamp,
  runTransaction
} from 'firebase/database';
import { 
  Camera, 
  Recycle, 
  Trophy, 
  ShoppingBag, 
  User, 
  LogOut, 
  Loader2, 
  ScanLine,
  Coins,
  History
} from 'lucide-react';
import firebaseConfig from './firebaseConfig';
import './App.css';

// --- Firebase Configuration ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const appId = import.meta.env.VITE_APP_ID || 'trashure-proto';
const initialAuthToken = import.meta.env.VITE_INITIAL_AUTH_TOKEN;

// --- Mock Vouchers ---
const VOUCHERS = [
  { id: 'v1', title: '5% Off Coffee', cost: 50, color: 'bg-amber-500' },
  { id: 'v2', title: 'Free Eco-Bag', cost: 150, color: 'bg-green-600' },
  { id: 'v3', title: 'Cinema Ticket', cost: 500, color: 'bg-purple-600' },
  { id: 'v4', title: '10% Grocery', cost: 1000, color: 'bg-blue-600' },
];

// --- Main Component ---

export default function App() {

  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain) {

    return (

      <div className="container">

        <div className="card">

          <h1 className="title-error">Firebase Configuration Missing</h1>

          <p>

            Please create a <code>.env.local</code> file in the root of your project and add your Firebase configuration.

          </p>

          <pre>

            <code>

              VITE_FIREBASE_CONFIG='&#123;"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."&#125;'

              <br />

              VITE_APP_ID="trashure-proto"

              <br />

              VITE_INITIAL_AUTH_TOKEN=""

            </code>

          </pre>

        </div>

      </div>

    );

  }

  // Auth State

  const [user, setUser] = useState(null);

  const [userData, setUserData] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);

  

  // App State

  const [currentView, setCurrentView] = useState('home');

  const [modelLoaded, setModelLoaded] = useState(false);

  const [model, setModel] = useState(null);

  

  // Scanner State

  const videoRef = useRef(null);

  const [scanning, setScanning] = useState(false);

  const [scanResult, setScanResult] = useState(null);

  const [capturedImage, setCapturedImage] = useState(null);

  const [feedbackMessage, setFeedbackMessage] = useState("");



  // Data State

  const [leaderboard, setLeaderboard] = useState([]);

  const [history, setHistory] = useState([]);



  // --- Initialization ---

  useEffect(() => {
    const init = async () => {
      // 1. Auth
      if (initialAuthToken) {
        await signInWithCustomToken(auth, initialAuthToken);
      }

      const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        setAuthLoading(false);
        if (u) {
          const userRef = ref(db, `users/${u.uid}`);
          onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
              setUserData(data);
            } else {
              const newUserData = {
                uid: u.uid,
                displayName: u.displayName || u.email?.split('@')[0] || 'EcoWarrior',
                email: u.email || '',
                points: 0,
                coins: 0,
                scanCount: 0
              };
              set(userRef, newUserData);
              setUserData(newUserData);
            }
          });
        }
      });

      // 2. Load AI
      const checkInterval = setInterval(async () => {
        if (window.mobilenet) {
          clearInterval(checkInterval);
          console.log("Loading MobileNet...");
          const loadedModel = await window.mobilenet.load();
          setModel(loadedModel);
          setModelLoaded(true);
          console.log("MobileNet Loaded");
        }
      }, 500);

      return () => {
        unsubscribeAuth();
        clearInterval(checkInterval);
      };
    };

    init();
  }, []);

  // --- Real-time Listeners ---
  useEffect(() => {
    if (!user) return;

    const usersRef = ref(db, 'users');
    const unsubLeaderboard = onValue(usersRef, (snapshot) => {
      const users = [];
      snapshot.forEach(childSnapshot => {
        users.push(childSnapshot.val());
      });
      users.sort((a, b) => b.points - a.points);
      setLeaderboard(users.slice(0, 10));
    });

    const historyRef = ref(db, `history/${user.uid}`);
    const unsubHistory = onValue(historyRef, (snapshot) => {
      const logs = [];
      snapshot.forEach(childSnapshot => {
        logs.push({ ...childSnapshot.val(), id: childSnapshot.key });
      });
      logs.sort((a, b) => b.timestamp - a.timestamp);
      setHistory(logs);
    });

    return () => {
      unsubLeaderboard();
      unsubHistory();
    };
  }, [user]);

  // --- Actions ---

  const handleCameraStart = async () => {
    setScanning(true);
    setScanResult(null);
    setFeedbackMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setFeedbackMessage("Could not access camera. Please allow permissions.");
    }
  };

  const handleCapture = async () => {
    if (!model || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/jpeg');
    setCapturedImage(dataUrl);
    
    const stream = video.srcObject;
    stream?.getTracks().forEach(t => t.stop());
    setScanning(false);

    const img = new Image();
    img.src = dataUrl;
    img.onload = async () => {
      setFeedbackMessage("Analyzing trash...");
      const predictions = await model.classify(img);
      setScanResult(predictions);
      
      const trashKeywords = ['bottle', 'cup', 'can', 'packet', 'carton', 'paper', 'plastic', 'wrapper', 'box', 'container', 'glass', 'mug', 'espresso', 'coffee'];
      const bestGuess = predictions[0].className.toLowerCase();
      const isTrash = trashKeywords.some(k => bestGuess.includes(k));
      
      if (isTrash) {
        setFeedbackMessage(`Identified: ${predictions[0].className}. Ready to recycle?`);
      } else {
        setFeedbackMessage(`Hmm, looks like "${predictions[0].className}". Is this recyclable?`);
      }
    };
  };

  const confirmRecycle = async () => {
    console.log("confirmRecycle called");
    console.log("User:", user);
    console.log("Scan result:", scanResult);

    if (!user || !scanResult) {
      console.error("User or scanResult is null");
      return;
    }
    
    const item = scanResult[0].className;
    const points = 10;
    const coins = 5;

    try {
      console.log("Updating user stats...");
      const userRef = ref(db, `users/${user.uid}`);
      runTransaction(userRef, (currentData) => {
        if (currentData) {
          currentData.points = (currentData.points || 0) + points;
          currentData.coins = (currentData.coins || 0) + coins;
          currentData.scanCount = (currentData.scanCount || 0) + 1;
        }
        return currentData;
      });
      console.log("User stats updated successfully.");

      console.log("Adding to history...");
      const historyRef = ref(db, `history/${user.uid}`);
      const newHistoryRef = push(historyRef);
      set(newHistoryRef, {
        itemName: item,
        category: 'Recyclable',
        confidence: scanResult[0].probability,
        timestamp: serverTimestamp(),
        pointsAwarded: points
      });
      console.log("History added successfully.");

      setCapturedImage(null);
      setScanResult(null);
      setCurrentView('home');
    } catch (error) {
      console.error("Error in confirmRecycle:", error);
    }
  };

  const redeemVoucher = async (voucher) => {
    if (!userData || userData.coins < voucher.cost) {
      alert("Not enough coins!");
      return;
    }
    
    if (confirm(`Redeem ${voucher.title} for ${voucher.cost} coins?`)) {
       const userRef = ref(db, `users/${user.uid}`);
       runTransaction(userRef, (currentData) => {
         if (currentData) {
           currentData.coins = (currentData.coins || 0) - voucher.cost;
         }
         return currentData;
       });
       alert("Voucher Redeemed! Check your email (mock).");
    }
  };

  // --- Sub-Components ---

  const AuthScreen = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');

    const handleGoogleSignIn = async () => {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        setError(error.message);
      }
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setError('');
      try {
        if (isRegister) {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          if (name) await updateProfile(cred.user, { displayName: name });
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
      } catch (err) {
        setError(err.message);
      }
    };

    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon">
            <Recycle width={48} height={48} />
          </div>
          <h1 className="auth-title">Trashure</h1>
          <p className="auth-subtitle">Turn your trash into treasure.</p>
          
          <form onSubmit={handleSubmit}>
            {isRegister && (
              <input 
                type="text" 
                placeholder="Display Name" 
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            )}
            <input 
              type="email" 
              placeholder="Email" 
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            {error && <p className="error-message">{error}</p>}
            
            <button className="button-primary">
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="auth-divider">
            <span>OR</span>
          </div>

          <button className="button-google" onClick={handleGoogleSignIn}>
            <svg className="google-icon" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              <path d="M1 1h22v22H1z" fill="none"/>
            </svg>
            Sign in with Google
          </button>

          <div className="auth-switch">
            <button 
              onClick={() => setIsRegister(!isRegister)}
            >
              {isRegister ? 'Already have an account? Sign In' : 'New to Trashure? Create Account'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (authLoading) return <div className="loading-screen"><Loader2 className="animate-spin" /></div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="app-container">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="logo">
          <div className="logo-icon">
            <Recycle />
          </div>
          <span>Trashure</span>
        </div>
        <div className="user-stats">
          <div className="coins">
            <Coins />
            <span>{userData?.coins || 0}</span>
          </div>
          <button onClick={() => signOut(auth)}>
            <LogOut />
          </button>
        </div>
      </div>

      <div className="main-content">
        
        {/* HOME VIEW */}
        {currentView === 'home' && (
          <>
            {/* Welcome Card */}
            <div className="welcome-card">
              <div className="welcome-card-content">
                <p>Welcome back,</p>
                <h2>{userData?.displayName}</h2>
                <div className="stats">
                  <div>
                    <p>Total Points</p>
                    <p>{userData?.points || 0}</p>
                  </div>
                  <div>
                    <p>Items Recycled</p>
                    <p>{userData?.scanCount || 0}</p>
                  </div>
                </div>
              </div>
              <Recycle className="welcome-card-bg-icon" />
            </div>

            {/* Action Grid */}
            <div className="action-grid">
              <button 
                onClick={() => setCurrentView('scan')}
                className="action-button"
              >
                <div className="action-button-icon">
                  <Camera />
                </div>
                <span>Scan Trash</span>
              </button>

              <button 
                onClick={() => setCurrentView('wallet')}
                className="action-button"
              >
                <div className="action-button-icon">
                  <ShoppingBag />
                </div>
                <span>Rewards</span>
              </button>
            </div>

            {/* Recent Activity */}
            <div className="recent-activity">
              <h3><History /> Recent Scans</h3>
              <div>
                {history.length === 0 ? (
                  <p>No scans yet. Start recycling!</p>
                ) : (
                  history.slice(0, 3).map(log => (
                    <div key={log.id} className="log-item">
                      <div className="log-item-details">
                        <div className="log-item-icon" />
                        <div>
                          <p>{log.itemName}</p>
                          <p>
                            {log.timestamp ? new Date(log.timestamp.seconds * 1000).toLocaleDateString() : 'Just now'}
                          </p>
                        </div>
                      </div>
                      <span>+{log.pointsAwarded} XP</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* SCAN VIEW */}
        {currentView === 'scan' && (
          <div className="scan-view">
            <h2>AI Scanner</h2>
            
            {!modelLoaded ? (
              <div className="card">
                <Loader2 className="animate-spin" />
                <p>Loading AI Brain...</p>
                <p>Downloading MobileNet Model</p>
              </div>
            ) : (
              <div className="scanner">
                {!capturedImage ? (
                   scanning ? (
                     <video 
                       ref={videoRef} 
                       autoPlay 
                       muted 
                       playsInline 
                     />
                   ) : (
                     <div className="camera-ready">
                       <Camera />
                       <p>Camera Ready</p>
                     </div>
                   )
                ) : (
                  <img src={capturedImage} alt="Captured" />
                )}

                {/* Overlay UI */}
                <div className="scanner-overlay">
                  {feedbackMessage && (
                    <div className="feedback-message">
                      {feedbackMessage}
                    </div>
                  )}

                  {!capturedImage ? (
                    scanning ? (
                      <button 
                        onClick={handleCapture}
                        className="button-primary"
                      >
                        Capture
                      </button>
                    ) : (
                      <button 
                        onClick={handleCameraStart}
                        className="button-primary"
                      >
                        Start Camera
                      </button>
                    )
                  ) : (
                    <div className="scanner-buttons">
                      <button 
                        onClick={() => {
                          setCapturedImage(null);
                          setScanResult(null);
                          handleCameraStart();
                        }}
                        className="button-secondary"
                      >
                        Retake
                      </button>
                      <button 
                        onClick={confirmRecycle}
                        disabled={!scanResult}
                        className="button-primary"
                      >
                        Confirm & Collect
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="tip">
              <p>
                <span>💡</span>
                Try scanning a bottle, cup, or can. The AI needs good lighting to see your trashure clearly!
              </p>
            </div>
          </div>
        )}

        {/* LEADERBOARD VIEW */}
        {currentView === 'leaderboard' && (
          <div className="leaderboard-view">
            <div className="leaderboard-header">
              <div>
                <Trophy />
              </div>
              <h2>Top Recyclers</h2>
              <p>Competing to save the planet</p>
            </div>

            <div className="leaderboard-list">
              {leaderboard.map((player, index) => (
                <div 
                  key={player.uid} 
                  className={`leaderboard-item ${player.uid === user.uid ? 'current-user' : ''}`}
                >
                  <div className="player-info">
                    <div className={`rank rank-${index + 1}`}>
                      {index + 1}
                    </div>
                    <div>
                      <p>
                        {player.displayName} {player.uid === user.uid && '(You)'}
                      </p>
                      <p>{player.scanCount} items recycled</p>
                    </div>
                  </div>
                  <div className="player-score">
                    <span>{player.points} XP</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WALLET VIEW */}
        {currentView === 'wallet' && (
          <div className="wallet-view">
            <div className="balance-card">
              <p>Current Balance</p>
              <div>
                <Coins />
                <span>{userData?.coins || 0}</span>
              </div>
            </div>

            <h3>Redeem Rewards</h3>
            
            <div className="voucher-list">
              {VOUCHERS.map(voucher => (
                <div key={voucher.id} className="voucher-item">
                  <div className="voucher-details">
                    <div className={`voucher-icon ${voucher.color}`}>
                      <ShoppingBag />
                    </div>
                    <div>
                      <h4>{voucher.title}</h4>
                      <p>{voucher.cost} Coins</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => redeemVoucher(voucher)}
                    disabled={!userData || userData.coins < voucher.cost}
                    className="button-claim"
                  >
                    Claim
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button 
          onClick={() => setCurrentView('home')} 
          className={currentView === 'home' ? 'active' : ''}
        >
          <ScanLine />
          <span>Home</span>
        </button>
        <button 
          onClick={() => setCurrentView('leaderboard')} 
          className={currentView === 'leaderboard' ? 'active' : ''}
        >
          <Trophy />
          <span>Rank</span>
        </button>
        
        <div className="scan-button-container">
          <button 
            onClick={() => setCurrentView('scan')} 
          >
            <Camera />
          </button>
        </div>

        <button 
          onClick={() => setCurrentView('wallet')} 
          className={currentView === 'wallet' ? 'active' : ''}
        >
          <ShoppingBag />
          <span>Shop</span>
        </button>
        <button 
          onClick={() => setCurrentView('home')}
        >
          <User />
          <span>Profile</span>
        </button>
      </div>
    </div>
  );
}