import React, { useState, useCallback, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db, auth } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const MAX_FILE_SIZE = 700 * 1024 * 1024; // 700MB

export default function FileUpload({ roomId, onComplete, onUpload }: { roomId: string, onComplete: () => void, onUpload?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const cancelUpload = () => {
    // With uploadBytes, we don't have easy cancellation like resumable
    // but we can at least reset the state.
    setUploading(false);
    setProgress(0);
    setError('Upload cancelled.');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    
    for (const file of fileList) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds 700MB limit.`);
        return;
      }
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(false);

    if (!auth.currentUser) {
      setError("Authentication not ready. Please wait a moment and try again.");
      setUploading(false);
      return;
    }

    const totalFiles = fileList.length;
    let completedFiles = 0;

    try {
      const uploadPromises = fileList.map(async (file, index) => {
        try {
          const storageRef = ref(storage, `rooms/${roomId}/${Date.now()}_${index}_${file.name}`);
          console.log(`Starting upload for ${file.name} to ${storageRef.fullPath}`);
          
          const result = await uploadBytes(storageRef, file);
          console.log(`Upload successful for ${file.name}`);
          
          const downloadURL = await getDownloadURL(result.ref);
          await addDoc(collection(db, 'rooms', roomId, 'feed'), {
            type: 'file',
            content: downloadURL,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            createdAt: serverTimestamp(),
          });
          
          completedFiles++;
          setProgress((completedFiles / totalFiles) * 100);
        } catch (err: any) {
          console.error(`Error uploading ${file.name}:`, err);
          throw new Error(`Failed to upload ${file.name}: ${err.message}`);
        }
      });

      await Promise.all(uploadPromises);
      
      onUpload?.();
      setSuccess(true);
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        onComplete();
      }, 1500);
    } catch (err: any) {
      console.error('Upload process error:', err);
      setError(err.message || 'Upload failed.');
      setUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  }, [roomId]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpload(e.target.files);
  };

  return (
    <div className="relative">
      <AnimatePresence>
        {uploading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute -top-24 left-0 right-0 bg-white text-black p-6 rounded-[32px] flex flex-col gap-4 shadow-2xl z-50 border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {success ? <Check className="w-5 h-5 text-green-600" /> : <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                <span className="text-xs font-bold uppercase tracking-widest text-gray-900">
                  {success ? 'All Files Uploaded!' : `Uploading... ${Math.round(progress)}%`}
                </span>
              </div>
              {!success && (
                <button 
                  onClick={(e) => { e.stopPropagation(); cancelUpload(); }}
                  className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 text-gray-600"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              )}
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.3)]" 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative group cursor-pointer transition-all duration-500",
          "bg-gray-50 border-2 border-dashed rounded-[40px] p-16",
          isDragging ? "border-blue-600 bg-blue-50/50 scale-[1.02]" : "border-gray-200 hover:border-blue-400 hover:bg-white",
          uploading && "pointer-events-none opacity-50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onFileSelect}
          className="hidden"
          disabled={uploading}
        />
        
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 rounded-3xl bg-white shadow-xl shadow-gray-200/50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-500">
            <Upload className="w-10 h-10" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold tracking-tight text-gray-900">Drop files here or click to browse</p>
            <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-widest">
              Up to 700MB • Multiple files supported
            </p>
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute -bottom-12 left-0 right-0 flex items-center justify-center gap-2 text-[10px] text-red-600 font-bold uppercase tracking-widest bg-red-50 py-2 rounded-xl border border-red-100"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </motion.div>
        )}
      </div>
    </div>
  );
}
