import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase"; // Conectamos con tus credenciales
import './App.css';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null); // Aquí guardamos quién ha entrado
  const [error, setError] = useState(''); // Para mostrar fallos de contraseña

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); 
    
    try {
      // Firebase comprueba si el usuario existe
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user); // ¡Éxito! Dejamos pasar a la usuaria
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      setError("Credenciales incorrectas. Vuelve a intentarlo.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setUser(null);
    setEmail('');
    setPassword('');
  };

  // PANTALLA 2: EL "DENTRO" DE LA APLICACIÓN (Si ha iniciado sesión)
  if (user) {
    const isAdmin = user.email.includes('.admin');
    
    return (
      <div className="landing-container">
        <header className="hero-section">
          <h1 className="agency-title">The Castoras House</h1>
          <p className="subtitle">Bienvenida, {user.email}</p>
        </header>
        <main className="content-section">
          <div className="login-box" style={{maxWidth: '600px'}}>
            <h3>{isAdmin ? "Panel de Control (Monitoras)" : "Tu Perfil de Influencer"}</h3>
            <p style={{color: 'var(--text-muted)'}}>
              Esta será la pantalla principal donde construiremos el Feed y las misiones.
            </p>
            
            {isAdmin && (
              <p style={{color: '#4A3265', fontWeight: 'bold', marginTop: '20px'}}>
                ✨ Sistema activado: Tienes permisos completos de administración.
              </p>
            )}
            
            <button onClick={handleLogout} className="login-btn" style={{marginTop: '40px'}}>
              Desconectar
            </button>
          </div>
        </main>
      </div>
    );
  }

  // PANTALLA 1: EL LOGIN (Si NO ha iniciado sesión)
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
            
            {/* Si hay error, mostramos un mensaje en rojo elegante */}
            {error && <p style={{color: '#D32F2F', fontSize: '0.85rem', margin: '0'}}>{error}</p>}
            
            <button type="submit" className="login-btn">Entrar a mi perfil</button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
