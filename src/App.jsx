import { useState } from 'react';
import './App.css';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // En el próximo paso conectaremos esto al cerebro de Firebase
    console.log("Intentando entrar con:", email);
    alert(`Verificando credenciales para: ${email}`);
  };

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
            <button type="submit" className="login-btn">Entrar a mi perfil</button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
