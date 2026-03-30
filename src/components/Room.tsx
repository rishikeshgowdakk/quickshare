import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Trash2, Copy, Check, Loader2, ArrowLeft, Plus, Video, Music, Image as ImageIcon, File as FileIcon, X, AlertCircle, RefreshCcw } from 'lucide-react';
import Feed from './Feed';
import FileUpload from './FileUpload';

const socket: Socket = io();

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [copying, setCopying] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textRef = useRef(text);

  // Keep ref in sync for beforeunload
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    // Initial data fetch
    const initRoom = async () => {
      if (!roomId) return;
      try {
        const roomRef = doc(db, 'rooms', roomId);
        const snapshot = await getDoc(roomRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.text !== undefined) setText(data.text);
        }
      } catch (err: any) {
        console.error("Initial Load Error:", err);
        setError(`Connection Error: ${err.message}`);
      }
    };
    initRoom();

    // Beforeunload handler to save pending changes
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveTimeoutRef.current) {
        // We can't await here, but we can try to trigger the save
        saveToCloud(textRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    socket.emit('join-room', roomId);
    socket.on('text-sync', ({ text: newText }) => {
      setText(prev => {
        if (newText !== prev) return newText;
        return prev;
      });
    });
    return () => {
      socket.off('text-sync');
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.text !== undefined) {
          setText(prev => {
            if (data.text !== prev) return data.text;
            return prev;
          });
        }
      }
    }, (error) => {
      console.error("Firestore Snapshot Error:", error);
    });
    return () => unsubscribe();
  }, [roomId]);

  const saveToCloud = async (newText: string) => {
    if (!roomId) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'rooms', roomId), {
        id: roomId,
        text: newText,
        lastActivity: serverTimestamp(),
      }, { merge: true });
      setLastSaved(new Date());
      setError(null);
    } catch (err: any) {
      console.error('Error saving:', err);
      setError(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    socket.emit('text-update', { roomId, text: newText });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveToCloud(newText), 1000); // Reduced to 1s
  };

  const clearText = async () => {
    if (!window.confirm('Clear all text in this room?')) return;
    try {
      await setDoc(doc(db, 'rooms', roomId!), { 
        text: '', 
        lastActivity: serverTimestamp() 
      }, { merge: true });
      setText('');
      socket.emit('text-update', { roomId, text: '' });
    } catch (err) {
      console.error('Error clearing text:', err);
    }
  };

  const manualSave = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveToCloud(text);
  };

  const copyLink = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-black font-sans p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('/')} className="group flex items-center gap-2 text-sm font-medium hover:text-blue-600 transition-colors">
            <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-blue-200 group-hover:bg-blue-50 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </div>
            Back to Home
          </button>
          <div className="h-4 w-[1px] bg-gray-200" />
          <h1 className="text-xl font-black tracking-tight">Mono <span className="text-blue-600">/{roomId}</span></h1>
        </div>
        
        <div className="flex items-center gap-3">
          {error && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-mono uppercase tracking-widest border border-red-100">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
            {isSaving ? (
              <span className="text-[10px] font-mono uppercase text-blue-500 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
              </span>
            ) : lastSaved ? (
              <span className="text-[10px] font-mono uppercase text-green-600 flex items-center gap-1.5">
                <Check className="w-3 h-3" /> Saved
              </span>
            ) : (
              <span className="text-[10px] font-mono uppercase text-gray-400 flex items-center gap-1.5">
                <RefreshCcw className="w-3 h-3" /> Auto-syncing
              </span>
            )}
          </div>

          <button 
            onClick={manualSave} 
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-black rounded-lg transition-all text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95"
            title="Save Now"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          
          <button 
            onClick={copyLink} 
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-black rounded-lg transition-all text-xs font-bold uppercase tracking-widest shadow-sm active:scale-95"
            title="Copy Room Code"
          >
            {copying ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copying ? 'Copied' : 'Share'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-180px)]">
        {/* Editor Side */}
        <div className="lg:col-span-8 flex flex-col bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Live Editor</span>
            </div>
            <button 
              onClick={clearText}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear Pad
            </button>
          </div>
          
          <div className="flex-grow p-8 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              placeholder="Start typing anything here... it saves automatically."
              className="w-full h-full text-lg leading-relaxed outline-none resize-none placeholder:text-gray-200 font-medium text-gray-800"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Feed Side */}
        <div className="lg:col-span-4 flex flex-col bg-white border border-gray-200 rounded-3xl shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Shared Files & Items</span>
            <button 
              onClick={() => setShowUploader(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Upload
            </button>
          </div>
          
          <div className="flex-grow overflow-y-auto p-6 bg-gray-50/50">
            <Feed roomId={roomId!} />
          </div>
        </div>
      </div>

      {/* Uploader Overlay */}
      <AnimatePresence>
        {showUploader && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xl bg-white rounded-[40px] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Upload Files</h2>
                  <p className="text-sm text-gray-400 mt-1">Share images, videos, or documents instantly.</p>
                </div>
                <button 
                  onClick={() => setShowUploader(false)} 
                  className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <FileUpload roomId={roomId!} onComplete={() => setShowUploader(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
