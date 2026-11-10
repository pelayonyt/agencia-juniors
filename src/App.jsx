import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import './App.css';

// --- 1. ESQUELETOS DE LAS PANTALLAS ---

const Feed = () => (
  <div>
    <h1 className="page-title">Feed</h1>
    <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Aquí irán las publicaciones de las demás influencers de la agencia.</p>
  </div>
);

const Campanas = () => (
  <div>
    <h1 className="page-title">Campañas</h1>
    <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Tablón de misiones activas. Sube un vídeo, promociona un producto, gana reputación.</p>
  </div>
);

const Ranking = () => (
  <div>
    <h1 className="page-title">Top Talentos</h1>
    <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Clasificación en tiempo real. ¿Quién domina The Castoras House?</p>
  </div>
);

const Perfil = ({ user, handleLogout }) => (
  <div style={{textAlign: 'center'}}>
    <h1 className="page-title">El Ego</h1>
    <div style={{background: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px'}}>
      <h2>0</h2>
      <p style={{color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase'}}>Seguidores</p>
    </div>
    <p style={{color: 'var(--text-muted)', marginBottom: '30px'}}>{user.email}</p>
    <button onClick={handleLogout} className="login-btn">Desconectar</button>
  </div>
);

const Admin = ({ handleLogout }) => (
  <div style={{textAlign: 'center'}}>
    <h1 className="page-title">Panel Dios</h1>
    <p style={{color: 'var(--text-muted)', marginBottom: '30px'}}>Bienvenido, Monitor. Desde aquí manipularemos la reputación en la sombra.</p>
    <button onClick={handleLogout} className="login-btn">Desconectar</button>
  </div>
);

// --- 2. COMPONENTE DEL MENÚ INFERIOR ---

const BottomNav = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${currentPath === '/' ? 'active' : ''}`}>
        <span className="nav-icon">📱</span>
        <span>Feed</span>
      </Link>
      <Link to="/campanas" className={`nav-item ${currentPath === '/campanas' ? 'active' : ''}`}>
        <span className="nav-icon">🎯</span>
        <span>Campañas</span>
      </Link>
      <Link to="/ranking" className={`nav-item ${currentPath === '/ranking' ? 'active' : ''}`}>
        <span className="nav-icon">🏆</span>
        <span>Ranking</span>
      </Link>
      <Link to="/perfil" className={`nav-item ${currentPath === '/perfil' ? 'active' : ''}`}>
        <span className="nav-icon">👤</span>
        <span>Perfil</span>
      </Link>
    </nav>
  );
};

// --- 3. APLICACIÓN PRINCIPAL ---

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Memoria de sesión: recuerda a la niña si recarga la página
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); 
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setError("Credenciales incorrectas. Vuelve a intentarlo.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  if (loading) return <div style={{textAlign: 'center', marginTop: '100px'}}>Cargando sistema...</div>;

  // PANTALLA 2: EL "DENTRO" DE LA APLICACIÓN
  if (user) {
    const isAdmin = user.email.includes('.admin');
    
    return (
      <Router>
        <div className="app-layout">
          <main className="main-content">
            <Routes>
              {/* Si es monitor, solo ve el Panel Dios. Si es niña, ve el juego. */}
              {isAdmin ? (
                <Route path="*" element={<Admin handleLogout={handleLogout} />} />
              ) : (
                <>
                  <Route path="/" element={<Feed />} />
                  <Route path="/campanas" element={<Campanas />} />
                  <Route path="/ranking" element={<Ranking />} />
                  <Route path="/perfil" element={<Perfil user={user} handleLogout={handleLogout} />} />
                </>
              )}
            </Routes>
          </main>
          {/* Mostramos el menú inferior solo a las niñas, no a los monitores */}
          {!isAdmin && <BottomNav />}
        </div>
      </Router>
    );
  }

  // PANTALLA 1: EL LOGIN
  return (
    <div className="landing-container">
      <header className="hero-section">
        <div className="logo-placeholder">✨</div>
        <h1 className="agency-title">The Castoras House</h1>
        <p className="subtitle">Exclusividad. Tendencia. Influencia.</p>
      </header>

      <main className="content-section">
        <div className="intro-text">
          <h2>Bienvenidas a la élite</h2>
          <p>
            No buscamos a cualquiera. Buscamos a las próximas referentes. 
            The Castoras House es la primera agencia donde tu imagen, 
            tus números y tu impacto lo son todo. ¿Estás lista para 
            moldear tu reputación y ascender a lo más alto?
          </p>
        </div>

        <div className="login-box">
          <h3>Acceso Talentos</h3>
          <form onSubmit={handleLogin}>
            <input 
              type="email" 
              placeholder="Correo asignado por la agencia" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
            <input 
              type="password" 
              placeholder="Contraseña" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
            {error && <p style={{color: '#D32F2F', fontSize: '0.85rem', margin: '0'}}>{error}</p>}
            <button type="submit" className="login-btn">Entrar a mi perfil</button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
