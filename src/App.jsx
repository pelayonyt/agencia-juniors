import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import './App.css';

const compressImage = (file, callback) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX = 600; 
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
      else { if (h > MAX) { w *= MAX / h; h = MAX; } }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.6)); 
    };
  };
};

// --- 1. FEED (Con poderes secretos para Admins) ---
const Feed = ({ user, isAdmin }) => {
  const [posts, setPosts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {}; snap.forEach(d => { uMap[d.id] = d.data(); });
      setUsersMap(uMap);
    });
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubPosts(); };
  }, [user]);

  const handlePublish = async () => {
    if (!text && !imageFile) return;
    setUploading(true);
    const savePost = async (photoBase64 = null) => {
      await addDoc(collection(db, 'posts'), {
        text: text, imageURL: photoBase64, authorId: user.uid, likedBy: [], createdAt: serverTimestamp()
      });
      setText(''); setImageFile(null); setUploading(false);
    };
    if (imageFile) compressImage(imageFile, savePost); else savePost();
  };

  const toggleLike = async (postId, currentLikedBy) => {
    const postRef = doc(db, 'posts', postId);
    if (currentLikedBy.includes(user.uid)) {
      await updateDoc(postRef, { likedBy: currentLikedBy.filter(uid => uid !== user.uid) });
    } else {
      await updateDoc(postRef, { likedBy: [...currentLikedBy, user.uid] });
    }
  };

  // PODERES DE ADMIN: Añadir/Quitar likes fantasmas
  const addFakeLikes = async (postId, currentLikedBy, amount) => {
    const bots = Array.from({length: amount}, () => `bot_${Math.random()}`);
    await updateDoc(doc(db, 'posts', postId), { likedBy: [...currentLikedBy, ...bots] });
  };

  const removeFakeLikes = async (postId, currentLikedBy, amount) => {
    const realLikes = currentLikedBy.filter(uid => !uid.startsWith('bot_'));
    const bots = currentLikedBy.filter(uid => uid.startsWith('bot_'));
    bots.splice(0, amount); // Elimina bots
    await updateDoc(doc(db, 'posts', postId), { likedBy: [...realLikes, ...bots] });
  };

  return (
    <div>
      <h1 className="page-title">Feed</h1>
      <div className="create-post-card">
        <textarea className="post-input" placeholder="¿Qué quieres compartir?" value={text} onChange={(e) => setText(e.target.value)} rows="3" />
        {imageFile && <p style={{fontSize: '0.8rem', color: '#4A3265', marginBottom: '10px'}}>✓ Foto lista</p>}
        <div className="post-actions">
          <div className="upload-photo-btn" onClick={() => fileInputRef.current.click()}>📷 Foto</div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={(e) => setImageFile(e.target.files[0])} />
          <button onClick={handlePublish} className="login-btn" style={{marginTop:0, padding:'10px 20px'}} disabled={uploading}>
            {uploading ? '...' : 'Publicar'}
          </button>
        </div>
      </div>

      {posts.map(post => {
        const author = usersMap[post.authorId] || { name: 'Cargando...', photoURL: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png' };
        const likedByArray = Array.isArray(post.likedBy) ? post.likedBy : [];
        const isLikedByMe = likedByArray.includes(user.uid);
        
        return (
          <div key={post.id} className="post-card">
            <div className="post-header">
              <img src={author.photoURL} alt="Avatar" className="post-avatar" />
              <span className="post-author">{author.name}</span>
            </div>
            {post.imageURL && <img src={post.imageURL} alt="Post" className="post-image" />}
            {post.text && <div className="post-body"><p className="post-text">{post.text}</p></div>}
            
            <div className="post-footer" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
              <div onClick={() => toggleLike(post.id, likedByArray)} style={{cursor:'pointer', fontSize:'1.4rem'}}>
                {isLikedByMe ? '❤️' : '🤍'} <span style={{fontSize:'1rem', color:'var(--text-main)'}}>{likedByArray.length}</span>
              </div>
              
              {/* BOTONES SECRETOS SOLO PARA MONITORES */}
              {isAdmin && (
                <div className="admin-secret-likes">
                  <span style={{fontSize:'0.7rem', color:'var(--text-muted)', display:'flex', alignItems:'center'}}>ADMIN LIKES:</span>
                  <button className="admin-btn" onClick={() => addFakeLikes(post.id, likedByArray, 10)}>+10</button>
                  <button className="admin-btn" onClick={() => removeFakeLikes(post.id, likedByArray, 10)}>-10</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// --- 2. RANKING ---
const Ranking = () => {
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordenar por seguidores de mayor a menor
      list.sort((a, b) => (b.followers || 0) - (a.followers || 0));
      setUsersList(list);
    });
    return () => unsub();
  }, []);

  const getMedal = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return index + 1;
  };

  return (
    <div>
      <h1 className="page-title">Top Talentos</h1>
      <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>La élite de The Castoras House en tiempo real.</p>
      <div className="ranking-list">
        {usersList.map((u, index) => (
          <div key={u.id} className="ranking-item">
            <div className="ranking-pos">{getMedal(index)}</div>
            <img src={u.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt="Avatar" className="ranking-avatar" />
            <div className="ranking-info">
              <span className="ranking-name">{u.name || u.email.split('@')[0]}</span>
              <span className="ranking-score">{u.followers || 0} seguidores</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- 3. PANEL DE CONTROL DIOS (SOLO ADMINS) ---
const AdminControl = () => {
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.followers || 0) - (a.followers || 0));
      setUsersList(list);
    });
    return () => unsub();
  }, []);

  const updateFollowers = async (uid, currentFollowers, amount) => {
    const newTotal = Math.max(0, (currentFollowers || 0) + amount); // No permite bajar de 0
    await updateDoc(doc(db, 'users', uid), { followers: newTotal });
  };

  return (
    <div>
      <h1 className="page-title" style={{color: '#4A3265'}}>Panel Dios</h1>
      <p style={{textAlign: 'center', color: 'var(--text-muted)', marginBottom:'20px'}}>Modifica la reputación de las influencers.</p>
      
      {usersList.map(u => (
        <div key={u.id} className="admin-user-row">
          <div>
            <div style={{fontWeight: 'bold', fontSize: '0.9rem'}}>{u.name || u.email.split('@')[0]}</div>
            <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{u.followers || 0} Seg.</div>
          </div>
          <div className="admin-controls">
            <button className="admin-btn" onClick={() => updateFollowers(u.id, u.followers, -50)}>-50</button>
            <button className="admin-btn" onClick={() => updateFollowers(u.id, u.followers, +100)}>+100</button>
          </div>
        </div>
      ))}
    </div>
  );
};

// --- 4. PERFIL Y RESTO ---
const Perfil = ({ user, handleLogout }) => {
  // (Mismo código de perfil que ya tenías)
  const [profileData, setProfileData] = useState({ name: '', photoURL: '', followers: 0 });
  const [userPosts, setUserPosts] = useState([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (d) => {
      if (d.exists()) { setProfileData(d.data()); if (!newName) setNewName(d.data().name || ''); } 
      else setDoc(userRef, { name: "Nueva Influencer", photoURL: "", followers: 0, email: user.email });
    });
    const q = query(collection(db, 'posts'), where("authorId", "==", user.uid), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(q, (s) => setUserPosts(s.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    return () => { unsubUser(); unsubPosts(); };
  }, [user]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    compressImage(file, (base64) => updateDoc(doc(db, 'users', user.uid), { photoURL: base64 }));
  };
  const handleSaveName = async () => {
    if (!newName.trim()) return;
    await updateDoc(doc(db, 'users', user.uid), { name: newName });
    setIsEditingName(false);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <h1 className="page-title">El Ego</h1>
      <div className="profile-header">
        <div className="profile-avatar-container" onClick={() => fileInputRef.current.click()}>
          <img src={profileData.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt="Avatar" className="profile-avatar" />
          <div className="profile-avatar-overlay">📷</div>
        </div>
        <input type="file" accept="image/*" ref={fileInputRef} style={{display: 'none'}} onChange={handlePhotoChange} />
        {isEditingName ? (
          <div className="profile-name-edit">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} style={{padding: '8px', width: '200px'}} />
            <button onClick={handleSaveName} className="login-btn" style={{marginTop: '0', padding: '10px 15px'}}>✓</button>
          </div>
        ) : (
          <div className="profile-name-edit" style={{cursor: 'pointer'}} onClick={() => setIsEditingName(true)}>
            <h2 style={{fontFamily: 'Playfair Display', fontSize: '1.8rem'}}>{profileData.name || "Tu Nombre"} ✎</h2>
          </div>
        )}
      </div>
      <div className="stats-container">
        <div className="stat-box"><div className="stat-number">{profileData.followers}</div><div className="stat-label">Seguidores</div></div>
        <div className="stat-box"><div className="stat-number">{userPosts.length}</div><div className="stat-label">Publicaciones</div></div>
      </div>
      <div className="profile-grid">
        {userPosts.map(post => post.imageURL ? <img key={post.id} src={post.imageURL} alt="Post" className="grid-item" /> : <div key={post.id} className="grid-item" style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'10px', fontSize:'0.7rem'}}>{post.text.substring(0,20)}...</div>)}
      </div>
      <button onClick={handleLogout} className="login-btn" style={{width: '100%', background: '#EAEAEA', color: 'var(--text-main)', boxShadow: 'none', marginTop: '20px'}}>
        Cerrar Sesión
      </button>
    </div>
  );
};

const Campanas = () => (
  <div><h1 className="page-title">Campañas</h1><p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Tablón de misiones activas.</p></div>
);

// --- NAVEGACIÓN Y APP PRINCIPAL ---
const BottomNav = ({ isAdmin }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${currentPath === '/' ? 'active' : ''}`}><span className="nav-icon">📱</span><span>Feed</span></Link>
      <Link to="/campanas" className={`nav-item ${currentPath === '/campanas' ? 'active' : ''}`}><span className="nav-icon">🎯</span><span>Campañas</span></Link>
      <Link to="/ranking" className={`nav-item ${currentPath === '/ranking' ? 'active' : ''}`}><span className="nav-icon">🏆</span><span>Ranking</span></Link>
      <Link to="/perfil" className={`nav-item ${currentPath === '/perfil' ? 'active' : ''}`}><span className="nav-icon">👤</span><span>Perfil</span></Link>
      {isAdmin && (
        <Link to="/admin" className={`nav-item ${currentPath === '/admin' ? 'active' : ''}`}><span className="nav-icon">👁️</span><span>Control</span></Link>
      )}
    </nav>
  );
};

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setLoading(false); });
    return unsubscribe;
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); 
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { setError("Credenciales incorrectas."); }
  };
  const handleLogout = () => signOut(auth);

  if (loading) return <div style={{textAlign: 'center', marginTop: '100px'}}>Cargando sistema...</div>;

  if (user) {
    const isAdmin = user.email.includes('.admin');
    return (
      <Router>
        <div className="app-layout">
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Feed user={user} isAdmin={isAdmin} />} />
              <Route path="/campanas" element={<Campanas />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/perfil" element={<Perfil user={user} handleLogout={handleLogout} />} />
              {isAdmin && <Route path="/admin" element={<AdminControl />} />}
            </Routes>
          </main>
          <BottomNav isAdmin={isAdmin} />
        </div>
      </Router>
    );
  }

  return (
    <div className="landing-container">
      <header className="hero-section">
        <div className="logo-placeholder">✨</div>
        <h1 className="agency-title">The Castoras House</h1>
        <p className="subtitle">Exclusividad. Tendencia. Influencia.</p>
      </header>
      <main className="content-section">
        <div className="login-box">
          <h3>Acceso Talentos</h3>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Correo asignado por la agencia" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {error && <p style={{color: '#D32F2F', fontSize: '0.85rem', margin: '0'}}>{error}</p>}
            <button type="submit" className="login-btn">Entrar a mi perfil</button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
