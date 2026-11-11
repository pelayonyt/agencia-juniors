import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
// ✨ AÑADIDO getDocs PARA PODER AVISAR A TODAS LAS NIÑAS A LA VEZ
import { doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, serverTimestamp, where, deleteDoc, limit, getDocs } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import './App.css';

const FAKE_NAMES = [
  "María", "Laura", "Lucía", "Carmen", "Ana", "Marta", "Paula", "Elena", 
  "Clara", "Sofía", "Julia", "Alba", "Carla", "Sara", "Valeria", "Claudia", 
  "Andrea", "Natalia", "Marina", "Daniela", "Martina", "Alejandra"
];

const getRank = (followers) => {
  if (followers < 100) return "Don Nadie";
  if (followers < 500) return "Aspirante";
  if (followers < 1500) return "Promesa";
  return "Élite";
};

const formatDate = (timestamp) => {
  if (!timestamp) return 'Ahora...';
  const date = timestamp.toDate();
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const AdminPostControls = ({ postId, likedByArray, authorId }) => {
  const [amount, setAmount] = useState(10);
  
  const addFakeLikes = async () => {
    if (amount <= 0) return;
    const bots = Array.from({length: amount}, () => {
      const randomName = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
      return `bot_${randomName}_${Math.random().toString(36).substring(2, 9)}`;
    });
    await updateDoc(doc(db, 'posts', postId), { likedBy: [...likedByArray, ...bots] });
    
    await addDoc(collection(db, 'notifications'), {
      recipientId: authorId,
      text: `A ${amount} personas más les ha gustado tu publicación.`,
      type: 'like',
      read: false,
      createdAt: serverTimestamp()
    });
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
  const [customMsg, setCustomMsg] = useState('');

  const updateFollowers = async (isAdding) => {
    const val = isAdding ? amount : -amount;
    const newTotal = Math.max(0, (currentFollowers || 0) + val);
    await updateDoc(doc(db, 'users', uid), { followers: newTotal });
    
    if (isAdding) {
      await addDoc(collection(db, 'notifications'), {
        recipientId: uid,
        text: `¡Estás en tendencia! Has ganado ${amount} seguidores nuevos.`,
        type: 'follower',
        read: false,
        createdAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, 'notifications'), {
        recipientId: uid,
        text: `Tu relevancia ha caído. Has perdido ${amount} seguidores.`,
        type: 'follower_loss', 
        read: false,
        createdAt: serverTimestamp()
      });
    }
  };

  const sendPsychologicalMessage = async () => {
    if (!customMsg.trim()) return;
    const randomName = FAKE_NAMES[Math.floor(Math.random() * FAKE_NAMES.length)];
    
    await addDoc(collection(db, 'notifications'), {
      recipientId: uid,
      text: `${randomName} ha comentado: "${customMsg}"`,
      type: 'comment', 
      read: false,
      createdAt: serverTimestamp()
    });
    setCustomMsg('');
    alert(`Se ha inyectado el mensaje bajo el nombre de ${randomName}.`);
  };

  return (
    <div className="admin-controls-wrapper" style={{width: '100%'}}>
      <div className="admin-control-group">
        <span className="admin-control-label">Gestión de Seguidores</span>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
          <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="admin-number-input" style={{width: '80px', margin:0}} />
          <button className="admin-btn" onClick={() => updateFollowers(false)}>- Quitar</button>
          <button className="admin-btn" onClick={() => updateFollowers(true)}>+ Añadir</button>
        </div>
      </div>
      
      <div className="admin-control-group" style={{marginBottom: 0}}>
        <span className="admin-control-label">Inyectar Comentario Falso</span>
        <div style={{display: 'flex', gap: '8px', width: '100%'}}>
          <input type="text" placeholder="Ej: Qué foto tan rara..." value={customMsg} onChange={e => setCustomMsg(e.target.value)} className="admin-notif-input" />
          <button className="admin-btn" onClick={sendPsychologicalMessage}>💬 Enviar</button>
        </div>
      </div>
    </div>
  );
};

const PostItem = ({ post, user, usersMap, isAdmin, toggleLike, handleDeletePost }) => {
  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [expandedComments, setExpandedComments] = useState(false); 
  
  const author = usersMap[post.authorId] || { name: 'Cargando...', photoURL: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png', followers: 0 };
  const likedByArray = Array.isArray(post.likedBy) ? post.likedBy : [];
  const commentsArray = Array.isArray(post.comments) ? post.comments : [];
  const isLikedByMe = likedByArray.includes(user.uid);
  
  const mediaUrl = post.mediaURL || post.imageURL;
  const isVideo = post.mediaType === 'video';
  const postDate = formatDate(post.createdAt);

  let likersText = '';
  if (likedByArray.length > 0) {
    const names = likedByArray.map(uid => {
      if (uid === user.uid) return "ti";
      if (uid.startsWith('bot_')) return uid.split('_')[1];
      return usersMap[uid]?.name?.split(' ')[0] || "Alguien";
    });
    if (names.length === 1) likersText = `Le gusta a ${names[0]}`;
    else if (names.length === 2) likersText = `Le gusta a ${names[0]} y ${names[1]}`;
    else likersText = `Le gusta a ${names[0]}, ${names[1]} y ${names.length - 2} más`;
  }

  const handleDoubleTap = () => {
    if (!isLikedByMe) toggleLike(post.id, likedByArray, post.authorId);
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    const newComment = { id: Date.now().toString() + Math.random(), authorId: user.uid, text: commentText.trim() };
    await updateDoc(doc(db, 'posts', post.id), { comments: [...commentsArray, newComment] });
    
    if (post.authorId !== user.uid) {
      const myName = usersMap[user.uid]?.name || "Alguien";
      await addDoc(collection(db, 'notifications'), {
        recipientId: post.authorId,
        text: `${myName} ha comentado: "${commentText.trim()}"`,
        type: 'comment',
        read: false,
        createdAt: serverTimestamp()
      });
    }
    
    setCommentText('');
    setExpandedComments(true); 
  };

  const handleDeleteComment = async (commentId) => {
    if (window.confirm("¿Borrar este comentario?")) {
      await updateDoc(doc(db, 'posts', post.id), { comments: commentsArray.filter(c => c.id !== commentId) });
    }
  };

  const reversedComments = [...commentsArray].reverse();
  const COMMENTS_LIMIT = 2;
  const visibleComments = expandedComments ? reversedComments : reversedComments.slice(0, COMMENTS_LIMIT);

  return (
    <div className="post-card">
      <div className="post-header">
        <img src={author.photoURL} alt="Avatar" className="post-avatar" />
        <div style={{display: 'flex', flexDirection: 'column', flex: 1}}>
          <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap'}}>
            <span className="post-author">{author.name}</span>
            <span className="mini-rank">{getRank(author.followers || 0)}</span>
          </div>
          <span className="post-date">{postDate}</span>
        </div>
        
        {post.campaignName && post.campaignName !== 'General' && <span className="post-tag">{post.campaignName}</span>}
        {(post.authorId === user.uid || isAdmin) && (
          <button className="delete-post-btn" onClick={() => handleDeletePost(post.id)}>🗑️</button>
        )}
      </div>
      
      {mediaUrl && (
        <div onDoubleClick={handleDoubleTap} style={{position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          {isVideo ? (
            <video src={mediaUrl} controls preload="metadata" className="post-video" />
          ) : (
            <img src={mediaUrl} alt="Post" loading="lazy" className="post-image" style={{cursor: 'pointer', userSelect: 'none'}} />
          )}
          {showHeart && <div className="big-heart">❤️</div>}
        </div>
      )}
      
      {post.text && (
        <div className="post-body" onDoubleClick={handleDoubleTap} style={{cursor: 'pointer', position: 'relative', userSelect: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          <p className="post-text" style={{width: '100%'}}>{post.text}</p>
          {showHeart && !mediaUrl && <div className="big-heart" style={{color: 'rgba(211,47,47,0.5)', fontSize: '4rem'}}>❤️</div>}
        </div>
      )}
      
      <div className="post-footer" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
        <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <div onClick={() => toggleLike(post.id, likedByArray, post.authorId)} style={{cursor:'pointer', fontSize:'1.4rem'}}>
            {isLikedByMe ? '❤️' : '🤍'} <span style={{fontSize:'1rem', color:'var(--text-main)'}}>{likedByArray.length}</span>
          </div>
          <div onClick={() => setShowComments(!showComments)} style={{cursor:'pointer', fontSize:'1.4rem', filter: showComments ? 'opacity(0.5)' : 'none'}}>
            💬 <span style={{fontSize:'1rem', color:'var(--text-main)'}}>{commentsArray.length}</span>
          </div>
        </div>

        {likersText && <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '5px'}}>{likersText}</div>}
        {isAdmin && <AdminPostControls postId={post.id} likedByArray={likedByArray} authorId={post.authorId} />}
      </div>

      {showComments && (
        <div className="comments-section">
          <form className="comment-input-row" onSubmit={handleAddComment} style={{marginBottom: '10px'}}>
            <input type="text" className="comment-input" placeholder="Añade un comentario..." value={commentText} onChange={(e) => setCommentText(e.target.value)} />
            <button type="submit" className="comment-submit-btn" disabled={!commentText.trim()}>Enviar</button>
          </form>
          {commentsArray.length === 0 ? (
            <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center'}}>Sé la primera en comentar.</p>
          ) : (
            <>
              {visibleComments.map(comment => {
                const commentAuthor = usersMap[comment.authorId] || { name: 'Cargando...', photoURL: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png' };
                return (
                  <div key={comment.id} className="comment-item">
                    <img src={commentAuthor.photoURL} alt="Avatar" className="comment-avatar" />
                    <div className="comment-content">
                      <div className="comment-author">{commentAuthor.name}</div>
                      <div className="comment-text">{comment.text}</div>
                      {(comment.authorId === user.uid || isAdmin) && (
                        <button className="delete-comment-btn" onClick={() => handleDeleteComment(comment.id)}>Borrar</button>
                      )}
                    </div>
                  </div>
                );
              })}
              {commentsArray.length > COMMENTS_LIMIT && (
                <button className="view-more-comments" onClick={() => setExpandedComments(!expandedComments)}>
                  {expandedComments ? 'Ocultar comentarios' : `Ver los ${commentsArray.length - COMMENTS_LIMIT} comentarios anteriores`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const Feed = ({ user, isAdmin }) => {
  const [posts, setPosts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [campaigns, setCampaigns] = useState([]);
  
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const fileInputRef = useRef(null);

  const [activeFilter, setActiveFilter] = useState('Todas');
  const [selectedCampaignForUpload, setSelectedCampaignForUpload] = useState('General');
  const [postLimit, setPostLimit] = useState(15);

  useEffect(() => {
    if (!user) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {}; snap.forEach(d => { uMap[d.id] = d.data(); });
      setUsersMap(uMap);
    });
    const unsubPosts = onSnapshot(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(postLimit)), (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCamps = onSnapshot(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc')), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubUsers(); unsubPosts(); unsubCamps(); };
  }, [user, postLimit]); 

  const getUploadText = (progress) => {
    if (progress < 25) return "Analizando contenido...";
    if (progress < 50) return "Calculando potencial de influencia...";
    if (progress < 80) return "Verificando estándares de la agencia...";
    if (progress < 100) return "El algoritmo está juzgando tu publicación...";
    return "¡Procesando!";
  };

  const handlePublish = async () => {
    if (!text && !mediaFile) return;
    setUploading(true); setUploadProgress(0);
    let mediaURL = null; let mediaType = null;

    if (mediaFile) {
      const isVideo = mediaFile.type.startsWith('video/');
      mediaType = isVideo ? 'video' : 'image';
      
      if (isVideo) {
        const sizeInMB = mediaFile.size / (1024 * 1024);
        const LIMITE_MB = 50; 
        if (sizeInMB > LIMITE_MB) { 
          alert(`Este vídeo pesa ${sizeInMB.toFixed(1)}MB (El máximo es ${LIMITE_MB}MB).`);
          setUploading(false); return; 
        }
      }

      const fileRef = ref(storage, `posts/${Date.now()}_${mediaFile.name}`);
      const uploadTask = uploadBytesResumable(fileRef, mediaFile);

      try {
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
            (error) => { alert("Fallo de conexión."); setUploading(false); reject(error); },
            async () => { mediaURL = await getDownloadURL(uploadTask.snapshot.ref); resolve(); }
          );
        });
      } catch (error) { return; }
    }

    await addDoc(collection(db, 'posts'), {
      text: text, mediaURL: mediaURL, mediaType: mediaType, authorId: user.uid, campaignName: selectedCampaignForUpload, likedBy: [], comments: [], createdAt: serverTimestamp()
    });
    
    setText(''); setMediaFile(null); setSelectedCampaignForUpload('General'); setUploading(false); setUploadProgress(0);
  };

  const toggleLike = async (postId, currentLikedBy, authorId) => {
    const postRef = doc(db, 'posts', postId);
    if (currentLikedBy.includes(user.uid)) {
      await updateDoc(postRef, { likedBy: currentLikedBy.filter(uid => uid !== user.uid) });
    } else {
      await updateDoc(postRef, { likedBy: [...currentLikedBy, user.uid] });
      if (authorId !== user.uid) {
        const myName = usersMap[user.uid]?.name || "Alguien";
        await addDoc(collection(db, 'notifications'), {
          recipientId: authorId,
          text: `A ${myName} le ha gustado tu publicación.`,
          type: 'like',
          read: false,
          createdAt: serverTimestamp()
        });
      }
    }
  };

  const handleDeletePost = async (postId) => {
    if (window.confirm("¿Seguro que quieres eliminar esta publicación?")) await deleteDoc(doc(db, 'posts', postId));
  };

  const displayedPosts = activeFilter === 'Todas' ? posts : posts.filter(post => post.campaignName === activeFilter);

  return (
    <div>
      <h1 className="page-title">Feed</h1>
      <div className="horizontal-scroll">
        <div className={`tag-pill ${activeFilter === 'Todas' ? 'active' : ''}`} onClick={() => setActiveFilter('Todas')}>Todas</div>
        <div className={`tag-pill ${activeFilter === 'General' ? 'active' : ''}`} onClick={() => setActiveFilter('General')}>General</div>
        {campaigns.map(camp => (
          <div key={camp.id} className={`tag-pill ${activeFilter === camp.title ? 'active' : ''}`} onClick={() => setActiveFilter(camp.title)}>{camp.title}</div>
        ))}
      </div>

      <div className="create-post-card">
        {uploading && (
          <div className="upload-overlay">
            <div className="upload-progress-text">{getUploadText(uploadProgress)}</div>
            <div className="upload-bar-bg"><div className="upload-bar-fill" style={{ width: `${uploadProgress}%` }}></div></div>
            <div className="upload-percentage">{uploadProgress}%</div>
          </div>
        )}
        <textarea className="post-input" placeholder="¿Qué quieres compartir hoy?" value={text} onChange={(e) => setText(e.target.value)} rows="3" />
        {mediaFile && <p style={{fontSize: '0.8rem', color: '#4A3265', marginBottom: '10px'}}>✓ {mediaFile.type.startsWith('video/') ? 'Vídeo' : 'Foto'} adjuntado</p>}
        
        <div style={{marginBottom: '15px'}}>
          <span style={{fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '5px'}}>Etiqueta tu publicación:</span>
          <div className="horizontal-scroll" style={{marginBottom: 0, paddingBottom: '5px'}}>
            <div className={`tag-pill ${selectedCampaignForUpload === 'General' ? 'active' : ''}`} onClick={() => setSelectedCampaignForUpload('General')}>General</div>
            {campaigns.map(camp => (
              <div key={camp.id} className={`tag-pill ${selectedCampaignForUpload === camp.title ? 'active' : ''}`} onClick={() => setSelectedCampaignForUpload(camp.title)}>{camp.title}</div>
            ))}
          </div>
        </div>

        <div className="post-actions">
          <div className="upload-photo-btn" onClick={() => fileInputRef.current.click()}>📷 Multimedia</div>
          <input type="file" accept="image/*,video/*" ref={fileInputRef} style={{display:'none'}} onChange={(e) => setMediaFile(e.target.files[0])} />
          <button onClick={handlePublish} className="login-btn" style={{marginTop:0, padding:'10px 20px'}} disabled={uploading}>Publicar</button>
        </div>
      </div>

      {displayedPosts.length === 0 ? (
        <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>No hay publicaciones con esta etiqueta.</p>
      ) : (
        <>
          {displayedPosts.map(post => (
            <PostItem key={post.id} post={post} user={user} usersMap={usersMap} isAdmin={isAdmin} toggleLike={toggleLike} handleDeletePost={handleDeletePost} />
          ))}
          {posts.length >= postLimit && (
            <button className="load-more-btn" onClick={() => setPostLimit(postLimit + 15)}>Cargar publicaciones anteriores</button>
          )}
        </>
      )}
    </div>
  );
};

const Actividad = ({ user }) => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where("recipientId", "==", user.uid), orderBy("createdAt", "desc"), limit(50));
    
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(notifs);
      
      snap.docs.forEach(docSnap => {
        if (docSnap.data().read === false) {
          updateDoc(doc(db, 'notifications', docSnap.id), { read: true });
        }
      });
    });
    return () => unsub();
  }, [user]);

  const getIcon = (type) => {
    if (type === 'like') return '❤️';
    if (type === 'follower') return '📈';
    if (type === 'follower_loss') return '📉'; 
    if (type === 'comment') return '💬'; 
    if (type === 'system') return '👁️';
    return '🔔';
  };

  return (
    <div>
      <h1 className="page-title">Tu Relevancia</h1>
      <p style={{textAlign: 'center', color: 'var(--text-muted)', marginBottom: '30px', fontSize: '0.85rem'}}>
        El algoritmo rastrea tu impacto social en The Castoras House.
      </p>

      {notifications.length === 0 ? (
        <p style={{textAlign:'center', color:'var(--text-muted)'}}>Aún eres invisible. Publica algo para existir.</p>
      ) : (
        notifications.map(n => (
          <div key={n.id} className={`notif-card ${n.read ? '' : 'notif-unread'}`}>
            <div className="notif-icon">{getIcon(n.type)}</div>
            <div className="notif-text-content">
              <div>{n.text}</div>
              <div className="post-date">{formatDate(n.createdAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

const Campanas = ({ isAdmin, user }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [reward, setReward] = useState('');

  // ✨ APAGAR LA BURBUJA AL ENTRAR A CAMPAÑAS
  useEffect(() => {
    if (user && !isAdmin) {
      updateDoc(doc(db, 'users', user.uid), { unreadCampaigns: false }).catch(() => {});
    }
  }, [user, isAdmin]);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {}; snap.forEach(d => { uMap[d.id] = d.data(); });
      setUsersMap(uMap);
    });
    const unsubCamps = onSnapshot(query(collection(db, 'campaigns'), orderBy('createdAt', 'desc')), (snap) => {
      setCampaigns(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubUsers(); unsubCamps(); };
  }, []);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!title || !desc) return;
    
    await addDoc(collection(db, 'campaigns'), {
      title: title, description: desc, reward: reward || "Reputación", reactions: [], createdAt: serverTimestamp()
    });

    // ✨ ENCENDER LA BURBUJA PARA TODAS LAS NIÑAS AL CREAR CAMPAÑA
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.forEach(u => {
      if (u.data().email && !u.data().email.includes('.admin')) {
        updateDoc(doc(db, 'users', u.id), { unreadCampaigns: true });
      }
    });

    setTitle(''); setDesc(''); setReward('');
  };

  const toggleReaction = async (campId, currentReactions) => {
    const campRef = doc(db, 'campaigns', campId);
    if (currentReactions.includes(user.uid)) await updateDoc(campRef, { reactions: currentReactions.filter(uid => uid !== user.uid) });
    else await updateDoc(campRef, { reactions: [...currentReactions, user.uid] });
  };

  return (
    <div>
      <h1 className="page-title">Campañas</h1>
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

      {campaigns.map(camp => {
        const reactionsArray = Array.isArray(camp.reactions) ? camp.reactions : [];
        const isReactedByMe = reactionsArray.includes(user.uid);
        let likersText = '';
        if (reactionsArray.length > 0) {
          const names = reactionsArray.map(uid => uid === user.uid ? "ti" : (usersMap[uid]?.name?.split(' ')[0] || "Alguien"));
          if (names.length === 1) likersText = `Apuntado por ${names[0]}`;
          else if (names.length === 2) likersText = `Apuntado por ${names[0]} y ${names[1]}`;
          else likersText = `Apuntado por ${names[0]}, ${names[1]} y ${names.length - 2} más`;
        }

        return (
          <div key={camp.id} className="campaign-card">
            <div className="campaign-header" style={{alignItems: 'center'}}>
              <h2 className="campaign-title" style={{margin: 0}}>{camp.title}</h2>
              <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                {camp.reward && <span className="campaign-reward">{camp.reward}</span>}
                {isAdmin && <button className="delete-post-btn" onClick={() => deleteDoc(doc(db, 'campaigns', camp.id))} style={{margin: 0}}>🗑️</button>}
              </div>
            </div>
            <p className="campaign-desc">{camp.description}</p>
            <div className="reaction-row" style={{flexDirection: 'column', alignItems: 'flex-start', gap: '8px'}}>
              <button className={`reaction-btn ${isReactedByMe ? 'active' : ''}`} onClick={() => toggleReaction(camp.id, reactionsArray)}>
                🔥 Me apunto <span>({reactionsArray.length})</span>
              </button>
              {likersText && <div style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '500'}}>{likersText}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

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
              <div style={{display: 'flex', alignItems: 'center'}}><span className="ranking-name">{u.name || u.email.split('@')[0]}</span><span className="mini-rank">{getRank(u.followers || 0)}</span></div>
              <span className="ranking-score">{u.followers || 0} seguidores</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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

  const handleDeleteUser = async (uid, name) => {
    if (window.confirm(`¿Seguro que quieres eliminar a ${name}?`)) await deleteDoc(doc(db, 'users', uid));
  };

  return (
    <div>
      <h1 className="page-title" style={{color: '#4A3265'}}>Panel Dios</h1>
      {usersList.map(u => (
        <div key={u.id} className="admin-user-card">
          
          <div className="admin-card-header">
            <div>
              <div style={{fontWeight: 'bold', fontSize: '1.05rem'}}>{u.name || u.email.split('@')[0]}</div>
              <div style={{fontSize: '0.85rem', color: 'var(--text-main)', marginTop: '2px'}}>{u.followers || 0} Seguidores</div>
            </div>
            <button className="delete-post-btn" onClick={() => handleDeleteUser(u.id, u.name)} style={{margin: 0}}>🗑️ Borrar</button>
          </div>

          <AdminUserControls uid={u.id} currentFollowers={u.followers} />
        </div>
      ))}
    </div>
  );
};

const Perfil = ({ user, isAdmin, handleLogout }) => {
  const [profileData, setProfileData] = useState({ name: '', photoURL: '', followers: 0 });
  const [userPosts, setUserPosts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);
  const [postLimit, setPostLimit] = useState(15);

  useEffect(() => {
    if (!user) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uMap = {}; snap.forEach(d => { uMap[d.id] = d.data(); });
      setUsersMap(uMap);
    });
    const userRef = doc(db, 'users', user.uid);
    const unsubUser = onSnapshot(userRef, (d) => {
      if (d.exists()) { setProfileData(d.data()); if (!newName) setNewName(d.data().name || ''); } 
      else setDoc(userRef, { name: "Nueva Influencer", photoURL: "", followers: 0, email: user.email });
    });
    const q = query(collection(db, 'posts'), where("authorId", "==", user.uid), orderBy('createdAt', 'desc'), limit(postLimit));
    const unsubPosts = onSnapshot(q, (s) => setUserPosts(s.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    
    return () => { unsubUsers(); unsubUser(); unsubPosts(); };
  }, [user, postLimit]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingAvatar(true);
    const fileRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
    await uploadBytesResumable(fileRef, file);
    const url = await getDownloadURL(fileRef);
    await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
    setUploadingAvatar(false);
  };
  
  const handleSaveName = async () => {
    if (!newName.trim()) return;
    await updateDoc(doc(db, 'users', user.uid), { name: newName });
    setIsEditingName(false);
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <h1 className="page-title">Tu Perfil</h1>
      <div className="profile-header">
        <div className="profile-avatar-container" onClick={() => fileInputRef.current.click()}>
          <img src={profileData.photoURL || "https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png"} alt="Avatar" className="profile-avatar" style={{opacity: uploadingAvatar ? 0.5 : 1}} />
          <div className="profile-avatar-overlay">📷</div>
        </div>
        <input type="file" accept="image/*" ref={fileInputRef} style={{display: 'none'}} onChange={handlePhotoChange} />
        <div className="profile-rank">{getRank(profileData.followers || 0)}</div>

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
      
      <h3 style={{marginTop: '20px', marginBottom: '15px', fontFamily: 'Playfair Display', width: '100%', textAlign: 'left'}}>Mi Galería</h3>
      
      <div className="profile-grid">
        {userPosts.map(post => {
          const mediaUrl = post.mediaURL || post.imageURL;
          return mediaUrl ? (
            <div key={post.id} className="grid-item" style={{position: 'relative', overflow: 'hidden', backgroundColor: '#000'}}>
              {post.mediaType === 'video' ? (
                <><video src={mediaUrl} className="grid-item" style={{objectFit: 'cover'}} /><div className="video-icon">▶</div></>
              ) : (<img src={mediaUrl} alt="Post" className="grid-item" />)}
            </div>
          ) : (
            <div key={post.id} className="grid-item" style={{display:'flex', alignItems:'center', justifyContent:'center', padding:'10px', fontSize:'0.7rem', textAlign: 'center'}}>{post.text.substring(0,20)}...</div>
          );
        })}
      </div>

      {userPosts.length >= postLimit && <button className="load-more-btn" onClick={() => setPostLimit(postLimit + 15)}>Cargar fotos anteriores</button>}
      <button onClick={handleLogout} className="login-btn" style={{width: '100%', background: '#EAEAEA', color: 'var(--text-main)', boxShadow: 'none', marginTop: '30px'}}>Cerrar Sesión</button>
    </div>
  );
};

const BottomNav = ({ user, isAdmin }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadCamp, setUnreadCamp] = useState(false); // ✨ NUEVO RASTREADOR DE CAMPAÑAS

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'notifications'), where("recipientId", "==", user.uid), where("read", "==", false));
    const unsubNotifs = onSnapshot(q, (snap) => setUnreadCount(snap.docs.length));
    
    // ✨ ESCUCHADOR DEL INTERRUPTOR DE CAMPAÑAS
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (d) => {
      if(d.exists()) setUnreadCamp(d.data().unreadCampaigns || false);
    });

    return () => { unsubNotifs(); unsubUser(); };
  }, [user]);

  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${currentPath === '/' ? 'active' : ''}`}><span className="nav-icon">📱</span><span>Feed</span></Link>
      
      <Link to="/campanas" className={`nav-item ${currentPath === '/campanas' ? 'active' : ''}`}>
        <div className="nav-icon-wrapper">
          <span className="nav-icon">🎯</span>
          {/* ✨ BURBUJA ROJA EN CAMPAÑAS */}
          {unreadCamp && <span className="notification-badge">!</span>}
        </div>
        <span>Campañas</span>
      </Link>

      <Link to="/actividad" className={`nav-item ${currentPath === '/actividad' ? 'active' : ''}`}>
        <div className="nav-icon-wrapper">
          <span className="nav-icon">🔔</span>
          {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
        </div>
        <span>Actividad</span>
      </Link>
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
              <Route path="/actividad" element={<Actividad user={user} />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/perfil" element={<Perfil user={user} isAdmin={isAdmin} handleLogout={handleLogout} />} />
              {isAdmin && <Route path="/admin" element={<AdminControl />} />}
            </Routes>
          </main>
          <BottomNav user={user} isAdmin={isAdmin} />
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
