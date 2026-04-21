/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Plus, 
  Sun,
  Moon,
  Search,
  Loader2,
  X
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from "@google/genai";

interface BingoSquare {
  id: number;
  title: string;
  checked: boolean;
}

const STORAGE_KEY = 'dnb-bingo-state';

const generateSessionId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({length: 3}, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('dnb-session') || generateSessionId();
  });
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('dnb-theme');
    return saved === 'dark' || !saved; 
  });

  const [squares, setSquares] = useState<BingoSquare[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false }));
  });

  const [mode, setMode] = useState<'setup' | 'play'>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.some((s: BingoSquare) => s.title.trim() !== '') ? 'play' : 'setup';
    }
    return 'setup';
  });
  
  const [hasWon, setHasWon] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);

  // Sync theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('dnb-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(squares));
  }, [squares]);

  useEffect(() => {
    localStorage.setItem('dnb-session', sessionId);
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
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] select-none font-sans p-6 md:p-12 flex flex-col items-center">
      <header className="w-full max-w-6xl flex flex-col md:flex-row justify-between items-center md:items-end mb-12 border-b border-[var(--border-dim)] pb-8 gap-6 md:gap-0">
        <div className="flex flex-col items-center md:items-start group cursor-pointer" onClick={() => window.location.reload()}>
          <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--brand)] font-semibold mb-1">Live Arena</span>
          <h1 className="text-5xl font-[800] tracking-tighter text-[var(--text-main)] uppercase italic group-hover:scale-105 transition-transform duration-300">
            DN<span className="text-[var(--brand)]">BINGO</span>
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
          {/* Mode Switcher */}
          <div className="flex w-full bg-[var(--surface)] p-1 rounded-xl border border-[var(--border-bright)] mb-8 shadow-sm">
            <button
              onClick={() => setMode('setup')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-[800] tracking-widest transition-all ${
                mode === 'setup' ? 'bg-[var(--border-bright)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Plus size={16} /> SETUP
            </button>
            <button
              onClick={() => setMode('play')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-[800] tracking-widest transition-all ${
                mode === 'play' ? 'bg-[var(--brand)] text-[var(--bg-app)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
            >
              <Play size={16} /> PLAY
            </button>
          </div>

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
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-4">
                  <span className="w-10 h-10 rounded-xl bg-[var(--brand)] text-[var(--bg-app)] font-[800] flex items-center justify-center text-xs tracking-tighter shadow-[0_0_15px_var(--shadow-color)]">
                    YOU
                  </span>
                  <span className="font-bold tracking-tight">Vibe_Check</span>
                </span>
                <span className="text-xs text-[var(--brand)] font-mono tracking-tighter uppercase font-bold">
                  {squares.filter(s => s.checked).length} / 3 Match
                </span>
              </div>

              <div className="flex items-center justify-between opacity-30 select-none">
                <span className="flex items-center gap-4">
                  <span className="w-10 h-10 rounded-xl bg-[var(--border-bright)] text-[var(--text-main)] font-[800] flex items-center justify-center text-xs tracking-tighter">
                    JP
                  </span>
                  <span className="font-bold tracking-tight">Jirka_P</span>
                </span>
                <span className="text-xs text-[var(--text-muted)] font-mono tracking-tighter uppercase">1 / 3 Match</span>
              </div>
            </div>

            <div className="h-[1px] bg-[var(--border-bright)] w-full my-2"></div>
            
            <div className="flex flex-col gap-3">
              <h3 className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Nastavení hry</h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setIsJoining(true)}
                  className="py-3 px-4 bg-[var(--surface-alt)] hover:bg-[var(--border-dim)] text-[var(--text-main)] rounded-xl text-[10px] font-[800] uppercase tracking-widest transition-all"
                >
                  Připojit k cizí
                </button>
                <button 
                  onClick={() => {
                    if (confirm('Spustit úplně novou hru a vymazat vše?')) {
                      setSessionId(generateSessionId());
                      setSquares(Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false })));
                      setMode('setup');
                      setHasWon(false);
                    }
                  }}
                  className="py-3 px-4 bg-[var(--surface-alt)] hover:bg-[var(--border-dim)] text-red-500 rounded-xl text-[10px] font-[800] uppercase tracking-widest transition-all"
                >
                  Nová hra
                </button>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="mt-16 text-center max-w-lg opacity-30 pb-12">
        <p className="text-[10px] uppercase leading-relaxed tracking-[0.3em] font-[800] text-[var(--text-muted)]">
          DN<span className="text-[var(--text-main)]">BINGO</span> SYSTEM v2.0.44-AUTO // SEARCH POWERED BY GOOGLE
        </p>
      </footer>

      {/* Winning Modal */}
      {hasWon && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[var(--surface)] p-8 rounded-3xl border border-[var(--brand)] shadow-[0_0_50px_var(--shadow-color)] max-w-sm w-full text-center flex flex-col gap-6"
          >
            <h2 className="text-4xl font-[800] text-[var(--brand)] italic">BINGO!</h2>
            <p className="text-[var(--text-muted)] text-sm">Právě jsi vyhrál. Co dál?</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { setSquares(prev => prev.map(s => ({...s, checked: false}))); setHasWon(false); }} className="w-full py-4 bg-[var(--brand)] text-[var(--bg-app)] rounded-xl font-[800] uppercase tracking-widest text-xs">
                Hrát znovu (Stejné songy)
              </button>
              <button onClick={() => { 
                setSessionId(generateSessionId());
                setSquares(Array.from({ length: 9 }, (_, i) => ({ id: i, title: '', checked: false }))); 
                setMode('setup'); 
                setHasWon(false); 
              }} className="w-full py-4 bg-[var(--surface-alt)] text-[var(--text-main)] border border-[var(--border-bright)] rounded-xl font-[800] uppercase tracking-widest text-xs hover:border-[var(--brand)] transition-colors">
                Založit novou hru
              </button>
            </div>
          </motion.div>
        </div>
      )}

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

