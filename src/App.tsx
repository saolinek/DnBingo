/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun,
  Moon,
  Search,
  Loader2,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, serverTimestamp, collection, query } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';

interface BingoSquare {
  id: number;
  title: string;
  checked: boolean;
}

const STORAGE_KEY = 'dnb-bingo-state';

const safeSetStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
};

const safeGetStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
};

const safeRemoveStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
};

const generateSessionId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({length: 3}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

// Initialize Gemini safely
let ai: GoogleGenAI | null = null;
try {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (apiKey) {
    ai = new GoogleGenAI({ apiKey });
  }
} catch (e) {
  console.warn("Gemini API key is not configured. Search will be unavailable.");
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.length === 3) {
      safeSetStorage('dnb-session', roomParam);
      // Clean up URL without reloading
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {}
      return roomParam;
    }
    return safeGetStorage('dnb-session') || '';
  });
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = safeGetStorage('dnb-theme');
    return saved === 'dark'; 
  });

  const [squares, setSquares] = useState<BingoSquare[]>(() => {
    const saved = safeGetStorage(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false }));
  });

  const [user, setUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<any[]>([]);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
    });
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
    }
  };

  const [mode, setMode] = useState<'setup' | 'play'>(() => {
    const saved = safeGetStorage(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.some((s: BingoSquare) => s?.title?.trim() !== '') ? 'play' : 'setup';
        }
      } catch (e) {
        console.warn('Failed to parse saved squares for mode', e);
      }
    }
    return 'setup';
  });
  
  const [hasWon, setHasWon] = useState(false);
  const [showWinNotification, setShowWinNotification] = useState(false);
  const [wonAt, setWonAt] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !sessionId) return;
    
    // Create/touch room so rules pass
    const roomRef = doc(db, 'rooms', sessionId);
    setDoc(roomRef, { createdAt: serverTimestamp() }, { merge: true }).catch(console.error);

    // Sync players
    const q = query(collection(db, `rooms/${sessionId}/players`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Syncing players for room ${sessionId}, count: ${snapshot.size}`);
      const p: any[] = [];
      snapshot.forEach(d => {
        p.push({ id: d.id, ...d.data() });
      });
      // Sort by win state: winners first. Then by wonAt timestamp (ascending so first to win is first).
      p.sort((a, b) => {
        if (a.hasWon && !b.hasWon) return -1;
        if (!a.hasWon && b.hasWon) return 1;
        if (a.hasWon && b.hasWon) {
           return (a.wonAt || 0) - (b.wonAt || 0);
        }
        return (b.checkedCount || 0) - (a.checkedCount || 0);
      });
      setPlayers(p);
    }, (err) => {
      console.error("Firestore snapshot error:", err);
    });

    return () => unsubscribe();
  }, [sessionId, user]);

  useEffect(() => {
    if (!user || !sessionId) return;
    const playerRef = doc(db, `rooms/${sessionId}/players`, user.uid);
    const checkedCount = squares.filter(s => s.checked).length;
    
    const dataToSave: any = {
      name: user.displayName || 'Hráč',
      checkedCount,
      hasWon,
      updatedAt: serverTimestamp()
    };
    if (wonAt) {
      dataToSave.wonAt = wonAt;
    }
    
    setDoc(playerRef, dataToSave, { merge: true }).catch(console.error);
  }, [hasWon, wonAt, sessionId, user, squares]);

  // Sync theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    safeSetStorage('dnb-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Auto-save to localStorage
  useEffect(() => {
    safeSetStorage(STORAGE_KEY, JSON.stringify(squares));
  }, [squares]);

  useEffect(() => {
    safeSetStorage('dnb-session', sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (searchQuery.length <= 2 || activeSearchIndex === null) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchTracks(searchQuery);
    }, 600); // 600ms debounce
    
    return () => clearTimeout(timer);
  }, [searchQuery, activeSearchIndex]);

  const checkWinner = useCallback((currentSquares: BingoSquare[]) => {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    for (const pattern of winPatterns) {
      if (pattern.every(index => currentSquares[index].checked && currentSquares[index].title.trim() !== '')) {
        return true;
      }
    }
    return false;
  }, []);

  const handleSquareClick = (id: number) => {
    if (mode === 'setup') return;

    const newSquares = squares.map(s => 
      s.id === id ? { ...s, checked: !s.checked } : s
    );
    setSquares(newSquares);

    if (!hasWon && checkWinner(newSquares)) {
      setHasWon(true);
      setShowWinNotification(true);
      setWonAt(Date.now());
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: [isDarkMode ? '#00FF9C' : '#00CC7A', '#ec4899', '#06b6d4', '#ffffff']
      });
    }
  };

  const updateTitle = (id: number, title: string) => {
    setSquares(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  };

  const searchTracks = async (q: string) => {
    try {
      if (!ai) {
        console.warn("AI functions are unavailable");
        return;
      }
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide 5 popular Drum and Bass tracks matching: ${q}. Give ONLY a JSON array of strings in format ["Artist - Title", ...]`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          tools: [{ googleSearch: {} }]
        }
      });
      const data = JSON.parse(response.text || "[]");
      setSearchResults(data);
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = (title: string) => {
    if (activeSearchIndex !== null) {
      updateTitle(activeSearchIndex, title);
      setActiveSearchIndex(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const isFull = squares.every(s => s.title.trim() !== '');

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] select-none font-sans flex flex-col">
      {!sessionId ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
          <div className="absolute top-6 right-6">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-3 bg-[var(--surface)] border border-[var(--border-bright)] rounded-xl text-[var(--text-main)] hover:bg-[var(--surface-alt)] transition-all shadow-sm"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
          
          <div className="max-w-md w-full bg-[var(--surface)] p-10 md:p-12 rounded-3xl border border-[var(--border-bright)] shadow-xl flex flex-col gap-10 text-center relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[var(--brand)] rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
            
            <div className="flex flex-col gap-2 relative z-10">
              <span className="text-[10px] uppercase tracking-[0.4em] text-[var(--brand)] font-bold mb-2">Live Arena</span>
              <h1 className="text-5xl md:text-6xl font-[800] tracking-tighter uppercase italic text-black drop-shadow-sm">
                DNB<span className="text-[var(--brand)]">INGO</span>
              </h1>
            </div>

            <div className="flex flex-col gap-4 relative z-10 mt-4">
              <button 
                onClick={() => {
                  setSessionId(generateSessionId());
                  setSquares(Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false })));
                  setMode('setup');
                  setHasWon(false);
                  setShowWinNotification(false);
                  setWonAt(null);
                }}
                className="w-full py-5 bg-[var(--brand)] text-[var(--bg-app)] rounded-2xl font-[800] uppercase tracking-widest text-sm shadow-[0_0_20px_var(--shadow-color)] hover:scale-[1.02] active:scale-95 transition-all"
              >
                Založit novou hru
              </button>
              
              <div className="relative flex items-center justify-center py-2">
                 <div className="h-[1px] w-full bg-[var(--border-bright)]"></div>
                 <span className="absolute bg-[var(--surface)] px-4 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-widest">nebo</span>
              </div>

              <button 
                onClick={() => setIsJoining(true)}
                className="w-full py-5 bg-[var(--surface-alt)] hover:bg-[var(--border-dim)] border border-[var(--border-bright)] text-[var(--text-main)] rounded-2xl font-[800] uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-95 transition-all"
              >
                Připojit ke hře
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-6 md:p-12 flex flex-col items-center">
          <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center md:items-end mb-12 border-b border-[var(--border-dim)] pb-8 gap-6 md:gap-0">
        <div className="flex flex-col items-center md:items-start group cursor-pointer" onClick={() => window.location.reload()}>
          <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--brand)] font-semibold mb-1">Live Arena</span>
          <h1 className="text-5xl font-[800] tracking-tighter text-black uppercase italic group-hover:scale-105 transition-transform duration-300">
            DNB<span className="text-[var(--brand)]">INGO</span>
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-3 bg-[var(--surface)] border border-[var(--border-bright)] rounded-xl text-[var(--text-main)] hover:bg-[var(--surface-alt)] transition-all shadow-sm"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          
          <div className="text-center md:text-right">
            <span className="block text-[10px] uppercase text-[var(--text-muted)] tracking-widest mb-1">Room Code</span>
            <span className="font-mono text-xl text-[var(--text-main)] tracking-wider uppercase">{sessionId}</span>
          </div>
          <div className="h-12 w-[1px] bg-[var(--border-dim)] hidden md:block"></div>
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <span className="block text-[10px] uppercase text-[var(--text-muted)] tracking-widest mb-1">Status</span>
            <span className="flex items-center gap-2 text-[var(--brand)] text-sm font-bold tracking-tighter">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--brand)] shadow-[0_0_12px_var(--brand)] animate-pulse"></span>
              ACTIVE GAME
            </span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-12 flex-1">
        <div className="lg:col-span-8 flex flex-col items-center">
          {mode === 'setup' && (
            <div className="w-full max-w-[600px] mb-8">
              <div className="bg-[var(--surface-alt)] p-4 rounded-xl border border-[var(--border-bright)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Nastavit hrací plochu</h3>
                  <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Vyplňte všech 9 písniček</p>
                </div>
                <button
                  disabled={!isFull}
                  onClick={() => setMode('play')}
                  className="py-3 px-8 bg-[var(--brand)] text-[var(--bg-app)] rounded-lg text-xs font-[800] uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 shadow-sm"
                >
                  Hrát
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 w-full aspect-square max-w-[600px]">
            <AnimatePresence mode="popLayout">
              {squares.map((square, idx) => (
                <motion.div
                  key={square.id}
                  layout
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className="h-full relative overflow-visible"
                >
                  {mode === 'setup' ? (
                    <div className="h-full relative group">
                      <textarea
                        value={square.title}
                        onFocus={() => setActiveSearchIndex(square.id)}
                        onChange={(e) => {
                          updateTitle(square.id, e.target.value);
                          setSearchQuery(e.target.value);
                        }}
                        placeholder={`Track ${idx + 1}...`}
                        className={`w-full h-full bg-[var(--surface)] border rounded-xl p-4 text-xs md:text-sm font-bold focus:border-[var(--brand)] outline-none transition-all resize-none placeholder:text-[var(--border-bright)] text-[var(--text-main)] shadow-sm ${
                          activeSearchIndex === square.id ? 'border-[var(--brand)] ring-4 ring-[var(--brand)]/5' : 'border-[var(--border-bright)]'
                        }`}
                      />
                      
                      {/* Local Search Autocomplete */}
                      {activeSearchIndex === square.id && searchQuery.length > 2 && (
                        <div className="absolute top-[105%] left-0 right-0 z-[100] bg-[var(--surface)] border border-[var(--border-bright)] rounded-xl shadow-2xl overflow-hidden min-w-[200px]">
                          <div className="p-3 border-b border-[var(--border-dim)] flex items-center justify-between bg-[var(--surface-alt)]">
                            <span className="text-[9px] font-800 uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-1">
                              <Search size={10} /> Searching Web...
                            </span>
                            <button onClick={() => { setActiveSearchIndex(null); setSearchResults([]); }}>
                              <X size={12} className="text-[var(--text-muted)]" />
                            </button>
                          </div>
                          
                          <div className="max-h-[200px] overflow-y-auto">
                            {isSearching ? (
                              <div className="p-6 flex justify-center">
                                <Loader2 size={20} className="animate-spin text-[var(--brand)]" />
                              </div>
                            ) : searchResults.length > 0 ? (
                              searchResults.map((res, i) => (
                                <button
                                  key={i}
                                  onClick={() => selectSearchResult(res)}
                                  className="w-full p-4 text-left text-xs font-bold hover:bg-[var(--brand)]/10 transition-colors border-b border-[var(--border-dim)] last:border-0 truncate"
                                >
                                  {res}
                                </button>
                              ))
                            ) : (
                              <div className="p-6 text-center text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                Žádné výsledky pro "{searchQuery}"
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      disabled={!square.title.trim()}
                      onClick={() => handleSquareClick(square.id)}
                      className={`group w-full h-full relative overflow-hidden flex flex-col items-center justify-center p-4 text-center rounded-xl border transition-all duration-300 ${
                        !square.title.trim() 
                          ? 'bg-[var(--surface)] border-[var(--border-bright)] opacity-20'
                          : square.checked
                            ? 'bg-[var(--brand)]/10 border-[var(--brand)] shadow-[inset_0_0_20px_var(--shadow-color)] translate-y-[1px]'
                            : 'bg-gradient-to-br from-[var(--surface)] to-[var(--surface-alt)] border-[var(--border-bright)] hover:border-[var(--brand)] active:scale-95 shadow-sm'
                      }`}
                    >
                      <div className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        square.checked ? 'bg-[var(--brand)] border-[var(--brand)]' : 'border-[var(--border-bright)] bg-[var(--bg-app)]'
                      }`}>
                        {square.checked && (
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke={isDarkMode ? "#0A0B0E" : "#FFFFFF"} strokeWidth="4" fill="none">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-[9px] uppercase tracking-widest font-mono mb-1 transition-colors ${
                        square.checked ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
                      }`}>
                        Track {idx + 1}
                      </span>
                      <span className={`text-xs md:text-sm font-[800] leading-tight tracking-tight uppercase break-words transition-colors ${
                        square.checked ? (isDarkMode ? 'text-white' : 'text-[var(--text-main)]') : 'text-[var(--text-main)] group-hover:text-[var(--brand)]'
                      }`}>
                        {square.title || ''}
                      </span>
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <aside className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-bright)] p-8 flex flex-col gap-6 shadow-sm">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] font-[800] border-b border-[var(--border-bright)] pb-4">Hráči v Roomce ({sessionId})</h2>
            <div className="space-y-6">
              {!user ? (
                <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-[var(--border-bright)] rounded-xl gap-4">
                  <p className="text-xs text-[var(--text-muted)]">Pro zobrazení hráčů se musíš přihlásit</p>
                  <button onClick={handleLogin} className="py-2 px-4 bg-[var(--brand)] text-[var(--bg-app)] rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm">
                    Přihlásit Googlem
                  </button>
                </div>
              ) : players.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-[var(--border-bright)] rounded-2xl gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--brand)] mb-2" />
                  <p className="text-xs font-bold text-[var(--text-main)]">Hledám ostatní hráče...</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Zatím jsi tu v této místnosti sám nebo se připojuješ.</p>
                </div>
              ) : (
                players.map((p) => {
                  const winnersList = players.filter(pl => pl.hasWon);
                  const rankIndex = winnersList.findIndex(w => w.id === p.id);
                  const isWinner = p.hasWon;
                  const rankString = isWinner ? `${rankIndex + 1}. BINGO` : '';

                  return (
                    <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl transition-all ${p.id === user.uid ? 'bg-[var(--brand)]/5 border border-[var(--brand)]/20' : 'bg-[var(--surface-alt)]/30 border border-transparent'} ${p.id !== user.uid && !isWinner && 'opacity-70'}`}>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className={`w-10 h-10 rounded-xl ${isWinner ? 'bg-[#ec4899] text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : p.id === user.uid ? 'bg-[var(--brand)] text-[var(--bg-app)]' : 'bg-[var(--surface-alt)] border border-[var(--border-bright)] text-[var(--text-main)]'} font-[900] flex items-center justify-center text-xs tracking-tighter transition-all`}>
                            {(p.name || 'Hráč').substring(0, 2).toUpperCase()}
                          </span>
                          {isWinner && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full border-2 border-[var(--surface)] flex items-center justify-center text-[8px]">🏆</div>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold tracking-tight text-sm flex gap-2 items-center text-[var(--text-main)]">
                            {p.name || 'Hráč'} {p.id === user.uid && <span className="text-[10px] text-[var(--brand)] uppercase font-black">(Ty)</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {Array.from({length: 9}).map((_, i) => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < (p.checkedCount || 0) ? (isWinner ? 'bg-[#ec4899]' : 'bg-[var(--brand)]') : 'bg-[var(--border-bright)]'}`} />
                              ))}
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold uppercase">
                              {p.checkedCount || 0}/9
                            </span>
                          </div>
                        </div>
                      </div>
                      {isWinner && (
                        <div className="flex flex-col items-end">
                          <span className={`text-[11px] font-black tracking-tighter uppercase text-[#ec4899] italic`}>
                            {rankIndex === 0 ? 'VÍTĚZ!' : `${rankIndex + 1}. MÍSTO`}
                          </span>
                          <span className="text-[8px] text-[var(--text-muted)] uppercase font-bold">BINGO</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="h-[1px] bg-[var(--border-bright)] w-full my-2"></div>
            
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Nastavení hry</h3>
              <button 
                onClick={() => {
                  if (confirm('Opravdu chcete opustit hru a vrátit se na domovskou obrazovku?')) {
                    safeRemoveStorage('dnb-session');
                    setSessionId('');
                    setMode('setup');
                    setSquares(Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false })));
                    setHasWon(false);
                    setShowWinNotification(false);
                    setWonAt(null);
                    try {
                      window.history.replaceState({}, '', window.location.pathname);
                    } catch (e) {}
                  }
                }}
                className="w-full py-3 px-4 bg-[var(--surface-alt)] hover:bg-[var(--border-dim)] text-red-500 rounded-xl text-[10px] font-[800] uppercase tracking-widest transition-all"
              >
                Ukončit hru
              </button>
            </div>
            
            <div className="h-[1px] bg-[var(--border-bright)] w-full my-2"></div>
            
            <div className="flex flex-col items-center gap-4 text-center mt-2">
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">QR pro připojení</h3>
              <div className="bg-white p-3 rounded-2xl shadow-sm">
                <QRCodeSVG 
                  value={`${window.location.origin}${window.location.pathname}?room=${sessionId}`} 
                  size={140}
                  level="H"
                  includeMargin={false}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <p className="text-[10px] text-[var(--text-muted)] max-w-[200px]">Naskenuj připojením z mobilu a rovnou hraj v této místnosti.</p>
            </div>
          </div>
        </aside>
      </main>
      </div>
      )}

      {/* Winning Notification */}
      <AnimatePresence>
        {hasWon && showWinNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-8 right-8 z-50 pointer-events-auto max-w-sm w-full"
          >
            <div className="bg-[var(--surface)] p-6 rounded-3xl border border-[#ec4899] shadow-[0_10px_40px_rgba(236,72,153,0.3)] flex flex-col gap-4 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#ec4899] rounded-full blur-[60px] opacity-20 pointer-events-none"></div>
              
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-[800] text-[#ec4899] italic tracking-tighter">BINGO!</h2>
                  {(() => {
                    const winnersList = players.filter(pl => pl.hasWon);
                    const rankIndex = winnersList.findIndex(w => w.id === user?.uid);
                    if (rankIndex >= 0) {
                      return <p className="text-[var(--text-main)] text-sm font-bold mt-1">Ukončil jsi hru na krásném <span className="text-[#ec4899]">{rankIndex + 1}. místě</span>!</p>;
                    }
                    return <p className="text-[var(--text-main)] text-sm font-bold mt-1">Gratulujeme, máš Bingo!</p>;
                  })()}
                </div>
                <button onClick={() => setShowWinNotification(false)} className="p-2 bg-[var(--surface-alt)] hover:bg-[var(--border-dim)] rounded-full text-[var(--text-muted)] transition-colors">
                  <X size={16} />
                </button>
              </div>

              <button 
                onClick={() => setShowWinNotification(false)} 
                className="w-full py-3 bg-[var(--surface-alt)] text-[var(--text-main)] border border-[var(--border-bright)] rounded-xl font-[800] uppercase tracking-widest text-xs hover:border-[#ec4899] transition-colors"
              >
                Pokračovat ve hře
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join Room Modal */}
      {isJoining && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] p-8 rounded-3xl border border-[var(--border-bright)] max-w-sm w-full shadow-2xl relative">
            <button onClick={() => setIsJoining(false)} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
              <X size={20} />
            </button>
            <h2 className="text-xl font-[800] text-[var(--text-main)] mb-6 uppercase tracking-tighter">Zadej kód (3 písmena)</h2>
            <input 
              type="text" 
              maxLength={3}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              placeholder="XYZ"
              className="w-full bg-[var(--surface-alt)] border border-[var(--border-bright)] rounded-xl p-4 text-center text-4xl font-mono font-bold text-[var(--text-main)] focus:border-[var(--brand)] outline-none transition-all mb-6 uppercase tracking-[0.5em]"
            />
            <button 
              disabled={joinCode.length !== 3}
              onClick={() => {
                setSessionId(joinCode);
                setIsJoining(false);
                setJoinCode('');
                setSquares(Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false })));
                setMode('setup');
                setHasWon(false);
                setWonAt(null);
              }}
              className="w-full py-4 bg-[var(--brand)] text-[var(--bg-app)] rounded-xl font-[800] uppercase tracking-widest text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              Připojit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

