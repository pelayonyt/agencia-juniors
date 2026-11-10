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

const AdminPostControls = ({ postId, likedByArray }) => {
  const [amount, setAmount] = useState(10);
  const addFakeLikes = async () => {
    if (amount <= 0) return;
    const bots = Array.from({length: amount}, () => `bot_${Math.random()}`);
    await updateDoc(doc(db, 'posts', postId), { likedBy: [...likedByArray, ...bots] });
  };
  const removeFakeLikes = async () => {
    if (amount <= 0) return;
    const realLikes = likedByArray.filter(uid => !uid.startsWith('bot_'));
    const bots = likedByArray.filter(uid => uid.startsWith('bot_'));
    bots.splice(0, amount);
    await updateDoc(doc(db, 'posts', postId), { likedBy: [...realLikes, ...bots] });
  };
  return (
    <div className="admin-secret-likes">
      <span style={{fontSize:'0.7rem', color:'var(--text-muted)', display:'flex', alignItems:'center'}}>ADMIN:</span>
      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="admin-number-input" />
      <button className="admin-btn" onClick={addFakeLikes}>+ Likes</button>
      <button className="admin-btn" onClick={removeFakeLikes}>- Likes</button>
    </div>
  );
};

const AdminUserControls = ({ uid, currentFollowers }) => {
  const [amount, setAmount] = useState(50);
  const updateFollowers = async (isAdding) => {
    const val = isAdding ? amount : -amount;
    const newTotal = Math.max(0, (currentFollowers || 0) + val);
    await updateDoc(doc(db, 'users', uid), { followers: newTotal });
  };
  return (
    <div className="admin-controls" style={{alignItems: 'center'}}>
      <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="admin-number-input" style={{width: '60px', margin:0}} />
      <button className="admin-btn" onClick={() => updateFollowers(false)}>- Seg</button>
      <button className="admin-btn" onClick={() => updateFollowers(true)}>+ Seg</button>
    </div>
  );
};


// --- 1. FEED (Con Filtros de Campañas) ---
const Feed = ({ user, isAdmin }) => {
  const [posts, setPosts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [campaigns, setCampaigns] = useState([]); // Guardamos las campañas para los filtros
  
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Estados para los filtros
  const [activeFilter, setActiveFilter] = useState('Todas');
  const [selectedCampaignForUpload, setSelectedCampaignForUpload] = useState('General');

  useEffect(() => {
    if (!user) return;
    
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {}; snap.forEach(d => { uMap[d.id] = d.data(); });
      setUsersMap(uMap);
    });
    
    const unsubPosts = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc')), (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCamps = onSnapshot(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc')), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUsers(); unsubPosts(); unsubCamps(); };
  }, [user]);

  const handlePublish = async () => {
    if (!text && !imageFile) return;
    setUploading(true);
    const savePost = async (photoBase64 = null) => {
      await addDoc(collection(db, 'posts'), {
        text: text, 
        imageURL: photoBase64, 
        authorId: user.uid, 
        campaignName: selectedCampaignForUpload, // Guardamos a qué campaña pertenece
        likedBy: [], 
        createdAt: serverTimestamp()
      });
      setText(''); setImageFile(null); setSelectedCampaignForUpload('General'); setUploading(false);
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

  // Filtramos las publicaciones según la pestaña seleccionada
  const displayedPosts = activeFilter === 'Todas' 
    ? posts 
    : posts.filter(post => post.campaignName === activeFilter);

  return (
    <div>
      <h1 className="page-title">Feed</h1>

      {/* BARRA DE FILTROS SUPERIOR */}
      <div className="horizontal-scroll">
        <div className={`tag-pill ${activeFilter === 'Todas' ? 'active' : ''}`} onClick={() => setActiveFilter('Todas')}>Todas</div>
        <div className={`tag-pill ${activeFilter === 'General' ? 'active' : ''}`} onClick={() => setActiveFilter('General')}>General</div>
        {campaigns.map(camp => (
          <div key={camp.id} className={`tag-pill ${activeFilter === camp.title ? 'active' : ''}`} onClick={() => setActiveFilter(camp.title)}>
            {camp.title}
          </div>
        ))}
      </div>

      <div className="create-post-card">
        <textarea className="post-input" placeholder="¿Qué quieres compartir con la élite hoy?" value={text} onChange={(e) => setText(e.target.value)} rows="3" />
        {imageFile && <p style={{fontSize: '0.8rem', color: '#4A3265', marginBottom: '10px'}}>✓ Foto adjuntada</p>}
        
        {/* SELECTOR DE CAMPAÑA PARA PUBLICAR */}
        <div style={{marginBottom: '15px'}}>
          <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '5px'}}>Etiqueta tu publicación:</span>
          <div className="horizontal-scroll" style={{marginBottom: 0, paddingBottom: '5px'}}>
            <div className={`tag-pill ${selectedCampaignForUpload === 'General' ? 'active' : ''}`} onClick={() => setSelectedCampaignForUpload('General')}>General</div>
            {campaigns.map(camp => (
              <div key={camp.id} className={`tag-pill ${selectedCampaignForUpload === camp.title ? 'active' : ''}`} onClick={() => setSelectedCampaignForUpload(camp.title)}>
                {camp.title}
              </div>
            ))}
          </div>
        </div>

        <div className="post-actions">
          <div className="upload-photo-btn" onClick={() => fileInputRef.current.click()}>📷 Foto</div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={(e) => setImageFile(e.target.files[0])} />
          <button onClick={handlePublish} className="login-btn" style={{marginTop:0, padding:'10px 20px'}} disabled={uploading}>
            {uploading ? '...' : 'Publicar'}
          </button>
        </div>
      </div>

      {displayedPosts.length === 0 ? (
        <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay publicaciones con esta etiqueta.</p>
      ) : (
        displayedPosts.map(post => {
          const author = usersMap[post.authorId] || { name: 'Cargando...', photoURL: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png' };
          const likedByArray = Array.isArray(post.likedBy) ? post.likedBy : [];
          const isLikedByMe = likedByArray.includes(user.uid);
          
          let likersText = '';
          if (likedByArray.length > 0) {
            const names = likedByArray.map(uid => uid === user.uid ? "ti" : (usersMap[uid]?.name?.split(' ')[0] || "Alguien"));
            if (names.length === 1) likersText = `Le gusta a ${names[0]}`;
            else if (names.length === 2) likersText = `Le gusta a ${names[0]} y ${names[1]}`;
            else likersText = `Le gusta a ${names[0]}, ${names[1]} y ${names.length - 2} más`;
          }

          return (
            <div key={post.id} className="post-card">
              <div className="post-header">
                <img src={author.photoURL} alt="Avatar" className="post-avatar" />
                <span className="post-author">{author.name}</span>
                {/* ETIQUETA VISUAL EN EL POST */}
                {post.campaignName && post.campaignName !== 'General' && (
                  <span className="post-tag">{post.campaignName}</span>
                )}
              </div>
              {post.imageURL && <img src={post.imageURL} alt="Post" className="post-image" />}
              {post.text && <div className="post-body"><p className="post-text">{post.text}</p></div>}
              
              <div className="post-footer" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                <div onClick={() => toggleLike(post.id, likedByArray)} style={{cursor:'pointer', fontSize:'1.4rem'}}>
                  {isLikedByMe ? '❤️' : '🤍'} <span style={{fontSize:'1rem', color:'var(--text-main)'}}>{likedByArray.length}</span>
                </div>
                {likersText && <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{likersText}</div>}
                {isAdmin && <AdminPostControls postId={post.id} likedByArray={likedByArray} />}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// --- 2. CAMPAÑAS (Con Reacciones) ---
const Campanas = ({ isAdmin, user }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [reward, setReward] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'campaigns'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCampaigns(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!title || !desc) return;
    await addDoc(collection(db, 'campaigns'), {
      title: title,
      description: desc,
      reward: reward || "Reputación",
      reactions: [], // Array para guardar quién se apunta
      createdAt: serverTimestamp()
    });
    setTitle(''); setDesc(''); setReward('');
  };

  // Función para apuntarse a una misión
  const toggleReaction = async (campId, currentReactions) => {
    const campRef = doc(db, 'campaigns', campId);
    if (currentReactions.includes(user.uid)) {
      await updateDoc(campRef, { reactions: currentReactions.filter(uid => uid !== user.uid) });
    } else {
      await updateDoc(campRef, { reactions: [...currentReactions, user.uid] });
    }
  };

  return (
    <div>
      <h1 className="page-title">Campañas</h1>
      <p style={{textAlign: 'center', color: 'var(--text-muted)', marginBottom: '30px'}}>Misiones activas de The Castoras House.</p>

      {isAdmin && (
        <div className="create-post-card" style={{border: '2px dashed var(--text-main)'}}>
          <h3 style={{marginBottom: '15px', fontFamily: 'Playfair Display'}}>⚡ Nueva Misión</h3>
          <form onSubmit={handleCreateCampaign} style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
            <input type="text" placeholder="Título (ej. Unboxing Misterioso)" value={title} onChange={(e) => setTitle(e.target.value)} required style={{padding: '10px'}} />
            <textarea className="post-input" placeholder="Instrucciones..." value={desc} onChange={(e) => setDesc(e.target.value)} rows="3" required />
            <input type="text" placeholder="Recompensa (ej. +500 Seg)" value={reward} onChange={(e) => setReward(e.target.value)} style={{padding: '10px'}} />
            <button type="submit" className="login-btn" style={{marginTop: '10px'}}>Publicar Campaña</button>
          </form>
        </div>
      )}

      {campaigns.length === 0 ? (
        <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay misiones activas.</p>
      ) : (
        campaigns.map(camp => {
          const reactionsArray = Array.isArray(camp.reactions) ? camp.reactions : [];
          const isReactedByMe = reactionsArray.includes(user.uid);

          return (
            <div key={camp.id} className="campaign-card">
              <div className="campaign-header">
                <h2 className="campaign-title">{camp.title}</h2>
                {camp.reward && <span className="campaign-reward">{camp.reward}</span>}
              </div>
              <p className="campaign-desc">{camp.description}</p>
              
              {/* BOTÓN DE INTERACCIÓN SUTIL */}
              <div className="reaction-row">
                <button 
                  className={`reaction-btn ${isReactedByMe ? 'active' : ''}`}
                  onClick={() => toggleReaction(camp.id, reactionsArray)}
                >
                  🔥 Me apunto <span>({reactionsArray.length})</span>
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// --- 3. RANKING ---
const Ranking = () => {
  const [usersList, setUsersList] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.followers || 0) - (a.followers || 0));
      setUsersList(list);
    });
    return () => unsub();
  }, []);
  const getMedal = (index) => {
    if (index === 0) return '🥇'; if (index === 1) return '🥈'; if (index === 2) return '🥉'; return index + 1;
  };
  return (
    <div>
      <h1 className="page-title">Top Talentos</h1>
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

// --- 4. PANEL DE CONTROL DIOS ---
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
  return (
    <div>
      <h1 className="page-title" style={{color: '#4A3265'}}>Panel Dios</h1>
      {usersList.map(u => (
        <div key={u.id} className="admin-user-row">
          <div style={{flex: 1}}>
            <div style={{fontWeight: 'bold', fontSize: '0.9rem'}}>{u.name || u.email.split('@')[0]}</div>
            <div style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{u.followers || 0} Seg.</div>
          </div>
          <AdminUserControls uid={u.id} currentFollowers={u.followers} />
        </div>
      ))}
    </div>
  );
};

// --- 5. PERFIL ---
const Perfil = ({ user, handleLogout }) => {
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
      {isAdmin && <Link to="/admin" className={`nav-item ${currentPath === '/admin' ? 'active' : ''}`}><span className="nav-icon">👁️</span><span>Control</span></Link>}
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
              <Route path="/campanas" element={<Campanas isAdmin={isAdmin} user={user} />} />
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
