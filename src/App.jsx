import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "./firebase";
import './App.css';

// --- MAGIA ANTI-PAGOS: COMPRESOR DE IMÁGENES ---
// Esta función la usamos tanto para el avatar como para las fotos del feed
const compressImage = (file, callback) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (event) => {
    const img = new Image();
    img.src = event.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 600; // Un poco más grande para el feed, pero segura
      const MAX_HEIGHT = 600;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
      } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.6)); // Devuelve el texto Base64
    };
  };
};


// --- 1. VISTA DEL FEED ---
const Feed = ({ user }) => {
  const [posts, setPosts] = useState([]);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [userData, setUserData] = useState(null);
  const fileInputRef = useRef(null);

  // Traer los datos de la niña actual y todas las publicaciones
  useEffect(() => {
    if (!user) return;
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (d) => {
      if (d.exists()) setUserData(d.data());
    });

    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubUser(); unsubPosts(); };
  }, [user]);

  const handlePublish = async () => {
    if (!text && !imageFile) return;
    setUploading(true);

    const savePostToDB = async (photoBase64 = null) => {
      await addDoc(collection(db, 'posts'), {
        text: text,
        imageURL: photoBase64,
        authorId: user.uid,
        authorName: userData?.name || "Influencer",
        authorAvatar: userData?.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png",
        likes: 0,
        createdAt: serverTimestamp()
      });
      setText('');
      setImageFile(null);
      setUploading(false);
    };

    if (imageFile) {
      compressImage(imageFile, savePostToDB);
    } else {
      savePostToDB();
    }
  };

  return (
    <div>
      <h1 className="page-title">Feed</h1>
      
      {/* Caja para crear nueva publicación */}
      <div className="create-post-card">
        <textarea 
          className="post-input" 
          placeholder="¿Qué quieres compartir con la élite hoy?" 
          value={text} 
          onChange={(e) => setText(e.target.value)}
          rows="3"
        />
        {imageFile && <p style={{fontSize: '0.8rem', color: '#4A3265', marginBottom: '10px'}}>✓ Foto adjuntada</p>}
        <div className="post-actions">
          <div className="upload-photo-btn" onClick={() => fileInputRef.current.click()}>
            📷 Añadir foto
          </div>
          <input type="file" accept="image/*" ref={fileInputRef} style={{display: 'none'}} onChange={(e) => setImageFile(e.target.files[0])} />
          <button onClick={handlePublish} className="login-btn" style={{marginTop: 0, padding: '10px 20px'}} disabled={uploading}>
            {uploading ? 'Subiendo...' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* Muro de publicaciones */}
      {posts.map(post => (
        <div key={post.id} className="post-card">
          <div className="post-header">
            <img src={post.authorAvatar} alt="Avatar" className="post-avatar" />
            <span className="post-author">{post.authorName}</span>
          </div>
          {post.imageURL && <img src={post.imageURL} alt="Post" className="post-image" />}
          {post.text && (
            <div className="post-body">
              <p className="post-text">{post.text}</p>
            </div>
          )}
          <div className="post-footer">
            <span style={{cursor: 'pointer'}}>🤍 {post.likes} Likes</span>
          </div>
        </div>
      ))}
    </div>
  );
};


// --- 2. VISTA DEL PERFIL ---
const Perfil = ({ user, handleLogout }) => {
  const [profileData, setProfileData] = useState({ name: '', photoURL: '', followers: 0 });
  const [userPosts, setUserPosts] = useState([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    
    // 1. Escuchar datos del usuario
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfileData(docSnap.data());
        if (!newName) setNewName(docSnap.data().name || '');
      } else {
        setDoc(userRef, { name: "Nueva Influencer", photoURL: "", followers: 0, email: user.email });
      }
    });

    // 2. Escuchar SOLO las publicaciones de esta niña para su cuadrícula
    const q = query(collection(db, 'posts'), where("authorId", "==", user.uid), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(q, (snapshot) => {
      setUserPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubUser(); unsubPosts(); };
  }, [user]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    compressImage(file, (base64) => {
      updateDoc(doc(db, 'users', user.uid), { photoURL: base64 })
        .then(() => setUploading(false))
        .catch(() => { alert("Error al subir."); setUploading(false); });
    });
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
          <img 
            src={profileData.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} 
            alt="Avatar" className="profile-avatar" style={{ opacity: uploading ? 0.5 : 1 }}
          />
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
        <p style={{color: 'var(--text-muted)'}}>{user.email}</p>
      </div>

      <div className="stats-container">
        <div className="stat-box">
          <div className="stat-number">{profileData.followers}</div>
          <div className="stat-label">Seguidores</div>
        </div>
        <div className="stat-box">
          <div className="stat-number">{userPosts.length}</div>
          <div className="stat-label">Publicaciones</div>
        </div>
      </div>

      {/* Cuadrícula de fotos estilo Instagram */}
      <div className="profile-grid">
        {userPosts.map(post => (
          post.imageURL ? (
            <img key={post.id} src={post.imageURL} alt="Post" className="grid-item" />
          ) : (
            <div key={post.id} className="grid-item" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', fontSize: '0.7rem', textAlign: 'center'}}>
              {post.text.substring(0, 30)}...
            </div>
          )
        ))}
      </div>

      <button onClick={handleLogout} className="login-btn" style={{width: '100%', background: '#EAEAEA', color: 'var(--text-main)', boxShadow: 'none'}}>
        Cerrar Sesión
      </button>
    </div>
  );
};

// --- VISTAS TEMPORALES (Campañas, Ranking, Admin) ---
const Campanas = () => (
  <div>
    <h1 className="page-title">Campañas</h1>
    <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Tablón de misiones activas.</p>
  </div>
);

const Ranking = () => (
  <div>
    <h1 className="page-title">Top Talentos</h1>
    <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Clasificación en tiempo real.</p>
  </div>
);

const Admin = ({ handleLogout }) => (
  <div style={{textAlign: 'center'}}>
    <h1 className="page-title">Panel Dios</h1>
    <p style={{color: 'var(--text-muted)', marginBottom: '30px'}}>Bienvenido, Monitor.</p>
    <button onClick={handleLogout} className="login-btn">Desconectar</button>
  </div>
);


// --- NAVEGACIÓN Y APP PRINCIPAL ---
const BottomNav = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${currentPath === '/' ? 'active' : ''}`}><span className="nav-icon">📱</span><span>Feed</span></Link>
      <Link to="/campanas" className={`nav-item ${currentPath === '/campanas' ? 'active' : ''}`}><span className="nav-icon">🎯</span><span>Campañas</span></Link>
      <Link to="/ranking" className={`nav-item ${currentPath === '/ranking' ? 'active' : ''}`}><span className="nav-icon">🏆</span><span>Ranking</span></Link>
      <Link to="/perfil" className={`nav-item ${currentPath === '/perfil' ? 'active' : ''}`}><span className="nav-icon">👤</span><span>Perfil</span></Link>
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
    e.preventDefault();
    setError(''); 
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { setError("Credenciales incorrectas. Vuelve a intentarlo."); }
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
              {isAdmin ? (
                <Route path="*" element={<Admin handleLogout={handleLogout} />} />
              ) : (
                <>
                  <Route path="/" element={<Feed user={user} />} />
                  <Route path="/campanas" element={<Campanas />} />
                  <Route path="/ranking" element={<Ranking />} />
                  <Route path="/perfil" element={<Perfil user={user} handleLogout={handleLogout} />} />
                </>
              )}
            </Routes>
          </main>
          {!isAdmin && <BottomNav />}
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
