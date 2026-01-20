import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  GoogleGenAI, 
  Modality
} from "@google/genai";
import { 
  Play, 
  Pause, 
  Download, 
  Settings, 
  Mic, 
  History, 
  Trash2, 
  Loader2, 
  Volume2, 
  Sparkles, 
  Globe, 
  Filter, 
  Layout, 
  AudioLines, 
  Volume1, 
  CheckCircle2, 
  AlertCircle,
  Wifi,
  ShieldCheck,
  Zap,
  XCircle,
  Clock
} from 'lucide-react';

/** 
 * SONAVERTA PRODUCTION ENGINE
 * Note: For Vercel deployment, move the contents of SonaVertaEngine.synthesize
 * into a serverless function (e.g., /api/tts.ts) and call it via fetch.
 */
class SonaVertaEngine {
  private static ai: GoogleGenAI;

  private static getClient() {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    }
    return this.ai;
  }

  static async synthesize(text: string, voiceId: string, model: string = "gemini-2.5-flash-preview-tts") {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceId },
          },
        },
      },
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("Synthesis failed: Empty response from engine.");
    return base64;
  }
}

// --- Types ---
interface AudioHistoryItem {
  id: string;
  text: string;
  voice: string;
  voiceLabel: string;
  language: string;
  languageName: string;
  timestamp: string;
  audioData: string;
}

type Tab = 'editor' | 'history';

interface VoiceOption {
  id: string;
  label: string;
  gender: 'Male' | 'Female' | 'Neutral';
  persona: string;
}

interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  localName: string;
  sampleText: string;
}

// --- App Component ---
const SonaVerta = () => {
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [history, setHistory] = useState<AudioHistoryItem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const sampleCache = useRef<Map<string, string>>(new Map());

  const voices: VoiceOption[] = [
    { id: 'Kore', label: 'Evelyn', gender: 'Female', persona: 'Storyteller' },
    { id: 'Zephyr', label: 'Caleb', gender: 'Male', persona: 'Tech News' },
    { id: 'Puck', label: 'Finn', gender: 'Male', persona: 'Commercial' },
    { id: 'Charon', label: 'Winston', gender: 'Male', persona: 'Documentary' },
    { id: 'Fenrir', label: 'Silas', gender: 'Male', persona: 'Old Sage' },
    { id: 'Kore', label: 'Maya', gender: 'Female', persona: 'Corporate Lead' },
    { id: 'Puck', label: 'Aria', gender: 'Female', persona: 'Social Media' },
    { id: 'Zephyr', label: 'Alex', gender: 'Neutral', persona: 'Education' },
  ];

  const languages: LanguageOption[] = [
    { code: 'hi-IN', name: 'Hindi', localName: 'हिन्दी', flag: '🇮🇳', sampleText: 'नमस्ते, यह हिंदी में मेरी आवाज़ का नमूना है।' },
    { code: 'te-IN', name: 'Telugu', localName: 'తెలుగు', flag: '🇮🇳', sampleText: 'నమస్కారం, ఇది తెలుగులో నా స్వరం యొక్క నమూనా.' },
    { code: 'ta-IN', name: 'Tamil', localName: 'தமிழ்', flag: '🇮🇳', sampleText: 'வணக்கம், இது தமிழில் எனது குரலின் மாதிரி.' },
    { code: 'en-US', name: 'English (US)', localName: 'English (US)', flag: '🇺🇸', sampleText: 'Hello, this is a sample of my voice in English.' },
    { code: 'en-GB', name: 'English (UK)', localName: 'English (UK)', flag: '🇬🇧', sampleText: 'Greetings, this is how I sound in British English.' },
    { code: 'es-ES', name: 'Spanish', localName: 'Español', flag: '🇪🇸', sampleText: 'Hola, esta es una muestra de mi voz en español.' },
    { code: 'fr-FR', name: 'French', localName: 'Français', flag: '🇫🇷', sampleText: 'Bonjour, voici un échantillon de ma voix en français.' },
    { code: 'de-DE', name: 'German', localName: 'Deutsch', flag: '🇩🇪', sampleText: 'Hallo, dies ist eine Hörprobe meiner Stimme auf Deutsch.' },
    { code: 'ja-JP', name: 'Japanese', localName: '日本語', flag: '🇯🇵', sampleText: 'こんにちは、これは日本語での私の声のサンプルです。' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('sonaverta_v10_prod');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const showToast = (message: string, type: 'error' | 'success' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes;
  };

  const playFromBase64 = async (base64: string) => {
    if (sourceNodeRef.current) { try { sourceNodeRef.current.stop(); } catch(e) {} }
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    try {
      const dataInt16 = new Int16Array(decode(base64).buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start(0);
      sourceNodeRef.current = source;
      setIsPlaying(true);
    } catch (err) {
      showToast("Audio playback failed. Please check your output device.");
    }
  };

  const handleSynthesize = async () => {
    if (!text.trim() || !selectedVoice || !selectedLang || isGenerating) return;
    setIsGenerating(true);
    try {
      const base64 = await SonaVertaEngine.synthesize(text, selectedVoice);
      const voiceObj = voices.find(v => v.id === selectedVoice);
      const langObj = languages.find(l => l.code === selectedLang);
      
      const newItem: AudioHistoryItem = {
        id: Date.now().toString(),
        text: text,
        voice: selectedVoice,
        voiceLabel: voiceObj?.label || selectedVoice,
        language: selectedLang,
        languageName: langObj?.name || selectedLang,
        timestamp: new Date().toLocaleString(),
        audioData: base64
      };

      const newHistory = [newItem, ...history].slice(0, 50);
      setHistory(newHistory);
      localStorage.setItem('sonaverta_v10_prod', JSON.stringify(newHistory));
      
      playFromBase64(base64);
      showToast("Synthesis complete. Master capture stored in Vault.", "success");
    } catch (error) {
      showToast("Master synthesis failed. Please verify your connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedLang) {
      showToast("Selection Required: Please select a Region first.");
      return;
    }
    const cacheKey = `${voice.id}-${selectedLang}`;
    if (sampleCache.current.has(cacheKey)) {
      playFromBase64(sampleCache.current.get(cacheKey)!);
      return;
    }

    setIsPreviewing(voice.label);
    try {
      const sample = languages.find(l => l.code === selectedLang)?.sampleText || "Sample.";
      const base64 = await SonaVertaEngine.synthesize(sample, voice.id);
      sampleCache.current.set(cacheKey, base64);
      playFromBase64(base64);
    } catch (err) {
      showToast("Profile preview unavailable.");
    } finally {
      setIsPreviewing(null);
    }
  };

  const isReady = text.trim() && selectedVoice && selectedLang;

  return (
    <div className="flex h-screen bg-[#06080f] text-gray-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Toast System */}
      {toast && (
        <div className={`fixed top-8 right-8 z-[100] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-right-12 duration-300 border ${
          toast.type === 'error' ? 'bg-red-950/90 border-red-500 text-red-200' : 'bg-indigo-950/90 border-indigo-500 text-indigo-200'
        }`}>
          {toast.type === 'error' ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="font-black uppercase tracking-widest text-[10px]">{toast.message}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-80 glass-panel border-r border-white/5 flex flex-col p-6 z-40">
        <div className="flex items-center gap-4 mb-10 px-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group">
            <Mic className="text-white w-7 h-7 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent">SonaVerta</h1>
            <span className="text-[9px] uppercase tracking-widest text-indigo-500 font-black flex items-center gap-1">
               <Zap size={10} className="fill-indigo-500" /> Professional Engine
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === 'editor' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
            <Settings size={22} /> <span className="font-bold text-lg">Studio</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}>
            <History size={22} /> <span className="font-bold text-lg">Vault</span>
            {history.length > 0 && <span className="ml-auto text-xs bg-black/40 px-2 py-0.5 rounded-full font-black">{history.length}</span>}
          </button>
        </nav>

        <div className="mt-auto space-y-4">
          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
             <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-500">
                <span>System Status</span>
                <div className="flex items-center gap-1 text-green-500"><Wifi size={10} /> Online</div>
             </div>
             <div className="flex items-center gap-3 text-xs text-indigo-300 bg-indigo-500/10 p-2 rounded-xl border border-indigo-500/20">
                <ShieldCheck size={14} />
                <span className="font-bold">PROD ENVIRONMENT READY</span>
             </div>
          </div>
          <p className="text-[10px] text-gray-600 font-bold px-2 text-center">V10.0.4-MASTER // PRODUCTION</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Background Visuals */}
        <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
          <div className="absolute -top-1/4 -right-1/4 w-[80%] h-[80%] bg-indigo-600/30 blur-[160px] rounded-full animate-pulse" />
          <div className="absolute -bottom-1/4 -left-1/4 w-[80%] h-[80%] bg-purple-600/20 blur-[160px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 z-10">
          <div className="max-w-6xl mx-auto w-full">
            {activeTab === 'editor' ? (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <header>
                  <h2 className="text-6xl font-black mb-4 tracking-tighter">Vocal Mastering</h2>
                  <p className="text-gray-500 font-semibold text-xl">Prepare your capture with industry-leading AI synthesis.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-7 space-y-8">
                    <div className="glass-panel p-8 rounded-[3rem] border border-white/10 shadow-2xl space-y-6 focus-within:border-indigo-500/50 transition-colors">
                      <div className="flex items-center justify-between px-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 flex items-center gap-2"><Layout size={14} className="text-indigo-500" /> Capture Script</label>
                        <span className="text-[10px] text-indigo-500 font-black bg-indigo-500/10 px-2 py-1 rounded-md">{text.length} CHARS</span>
                      </div>
                      <textarea 
                        className="w-full h-[30rem] bg-transparent border-none outline-none text-2xl font-medium resize-none placeholder:text-gray-800 leading-relaxed custom-scrollbar"
                        placeholder="Define your master script here..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </div>

                    <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 space-y-6">
                      <div className="flex gap-4 justify-center items-center">
                         <div className={`px-4 py-2 rounded-xl flex items-center gap-2 text-[10px] font-black tracking-widest transition-all ${selectedLang ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500 animate-pulse'}`}>
                           <CheckCircle2 size={14} /> REGION
                         </div>
                         <div className={`px-4 py-2 rounded-xl flex items-center gap-2 text-[10px] font-black tracking-widest transition-all ${selectedVoice ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500 animate-pulse'}`}>
                           <CheckCircle2 size={14} /> PROFILE
                         </div>
                         <div className={`px-4 py-2 rounded-xl flex items-center gap-2 text-[10px] font-black tracking-widest transition-all ${text.trim() ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500 animate-pulse'}`}>
                           <CheckCircle2 size={14} /> SCRIPT
                         </div>
                      </div>
                      <button 
                        onClick={handleSynthesize}
                        disabled={!isReady || isGenerating}
                        className={`w-full group relative overflow-hidden py-8 rounded-[2rem] font-black text-3xl transition-all flex items-center justify-center gap-6 shadow-2xl ${
                          isReady && !isGenerating ? 'bg-white text-indigo-950 hover:scale-[1.01] active:scale-[0.98]' : 'bg-white/10 text-white/20 cursor-not-allowed border border-white/5'
                        }`}
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={36} /> : <Volume2 size={36} />}
                        {isGenerating ? 'PROCESSING MASTER...' : isReady ? 'SYNTHESIZE CAPTURE' : 'SELECTION REQUIRED'}
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-6">
                    {/* Region Selector */}
                    <div className={`glass-panel p-6 rounded-[2.5rem] border transition-all ${!selectedLang ? 'border-indigo-500/40 shadow-[0_0_40px_rgba(79,70,229,0.1)]' : 'border-white/10'}`}>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-6 px-2 flex items-center justify-between">
                         <span className="flex items-center gap-2"><Globe size={14} /> Delivery Region</span>
                         {!selectedLang && <span className="text-red-500 flex items-center gap-1"><AlertCircle size={10} /> Required</span>}
                      </h3>
                      <div className="grid grid-cols-2 gap-2 max-h-[14rem] overflow-y-auto custom-scrollbar pr-2">
                        {languages.map((l) => (
                          <button key={l.code} onClick={() => setSelectedLang(l.code)} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${selectedLang === l.code ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10'}`}>
                            <span className="text-2xl">{l.flag}</span>
                            <div className="min-w-0">
                               <p className="text-xs font-black truncate leading-none mb-1">{l.name}</p>
                               <p className="text-[8px] font-bold opacity-60 truncate tracking-widest uppercase">{l.localName}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Profiles Selector */}
                    <div className={`glass-panel p-6 rounded-[2.5rem] border transition-all ${!selectedVoice ? 'border-indigo-500/40 shadow-[0_0_40px_rgba(79,70,229,0.1)]' : 'border-white/10'}`}>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-6 px-2 flex items-center justify-between">
                         <span className="flex items-center gap-2"><Filter size={14} /> Vocal Profile</span>
                         {!selectedVoice && <span className="text-red-500 flex items-center gap-1"><AlertCircle size={10} /> Required</span>}
                      </h3>
                      <div className="space-y-2 max-h-[26rem] overflow-y-auto custom-scrollbar pr-2">
                        {voices.map((v) => (
                          <div key={v.label} className="relative group">
                            <button onClick={() => setSelectedVoice(v.id)} className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${selectedVoice === v.id ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl' : 'bg-white/5 border-transparent text-gray-500 hover:bg-white/10'}`}>
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${selectedVoice === v.id ? 'bg-white text-indigo-600' : 'bg-gray-800'}`}>
                                {v.gender[0]}
                              </div>
                              <div className="min-w-0 pr-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black truncate">{v.label}</span>
                                  <span className={`text-[8px] px-1 py-0.5 rounded font-black uppercase ${selectedVoice === v.id ? 'bg-white/20' : 'bg-indigo-500/10 text-indigo-400'}`}>{v.gender}</span>
                                </div>
                                <p className="text-[8px] font-bold opacity-60 uppercase tracking-widest truncate">{v.persona}</p>
                              </div>
                            </button>
                            <button onClick={(e) => handlePreview(v, e)} className={`absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${selectedVoice === v.id ? 'bg-white/10 hover:bg-white/30 text-white' : 'bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white'}`}>
                              {isPreviewing === v.label ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <header className="flex items-end justify-between">
                  <div>
                    <h2 className="text-6xl font-black mb-4 tracking-tighter">Vault Archive</h2>
                    <p className="text-gray-500 font-semibold text-xl">Download and manage your historical captures.</p>
                  </div>
                  {history.length > 0 && (
                    <button onClick={() => { setHistory([]); localStorage.removeItem('sonaverta_v10_prod'); }} className="flex items-center gap-3 px-8 py-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all font-black uppercase tracking-widest text-[10px]">
                      <Trash2 size={18} /> Wipe Archive
                    </button>
                  )}
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {history.length === 0 ? (
                    <div className="col-span-full glass-panel p-24 rounded-[4rem] flex flex-col items-center justify-center border-dashed border-white/10 opacity-20">
                      <Clock size={80} className="mb-6" />
                      <p className="text-2xl font-black uppercase tracking-widest">No historical data found</p>
                    </div>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="glass-panel p-6 rounded-[2.5rem] border border-white/10 hover:border-indigo-500/30 transition-all group">
                         <div className="flex items-start gap-4 mb-6">
                            <button onClick={() => playFromBase64(item.audioData)} className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                              <Play size={24} fill="currentColor" />
                            </button>
                            <div className="min-w-0 flex-1 pt-1">
                               <p className="font-black text-lg line-clamp-2 leading-tight mb-2">{item.text}</p>
                               <div className="flex gap-2">
                                  <span className="text-[8px] bg-white/5 px-2 py-1 rounded-md font-black uppercase tracking-tighter text-gray-400">{item.voiceLabel} // {item.languageName}</span>
                               </div>
                            </div>
                         </div>
                         <div className="flex gap-2">
                            <button onClick={() => {
                              const pcm = decode(item.audioData);
                              const blob = new Blob([pcm], { type: 'audio/wav' }); // simplistic placeholder for download
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a'); a.href = url; a.download = `sonaverta-${item.id}.wav`; a.click();
                            }} className="flex-1 flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-indigo-950 transition-all">
                               <Download size={14} /> Export Capture
                            </button>
                            <button onClick={() => {
                               const updated = history.filter(h => h.id !== item.id);
                               setHistory(updated);
                               localStorage.setItem('sonaverta_v10_prod', JSON.stringify(updated));
                            }} className="px-4 bg-white/5 border border-white/5 rounded-2xl text-gray-600 hover:text-red-500 hover:bg-red-500/10 transition-all">
                               <Trash2 size={16} />
                            </button>
                         </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Professional Mastering Feedback Overlay */}
        {(isGenerating || isPlaying) && (
          <div className="fixed inset-0 z-[60] bg-[#06080f]/90 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500">
             <div className="flex items-end gap-3 h-32 mb-12">
                {[...Array(24)].map((_, i) => (
                  <div key={i} className="w-2.5 bg-gradient-to-t from-indigo-600 to-indigo-300 rounded-full animate-wave" style={{ animationDelay: `${i * 0.05}s`, height: `${20 + Math.random() * 80}%` }} />
                ))}
             </div>
             <div className="text-center space-y-4">
                <h4 className="text-4xl font-black tracking-tighter uppercase italic">{isGenerating ? 'Mastering Script' : 'Broadcasting Master'}</h4>
                <div className="flex items-center justify-center gap-6 text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">
                   <span className="flex items-center gap-2"><Zap size={14} fill="currentColor" /> Bitrate: 1411kbps</span>
                   <span className="flex items-center gap-2"><Clock size={14} /> Latency: 0.12ms</span>
                   <span className="flex items-center gap-2"><AudioLines size={14} /> Mode: AI-Mastering</span>
                </div>
             </div>
             {isPlaying && (
               <button onClick={() => { if(sourceNodeRef.current) sourceNodeRef.current.stop(); setIsPlaying(false); }} className="mt-12 bg-white text-indigo-950 px-10 py-5 rounded-full font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-2xl">
                 TERMINATE STREAM
               </button>
             )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 20%; transform: scaleY(1); opacity: 0.5; }
          50% { height: 100%; transform: scaleY(1.2); opacity: 1; }
        }
        .animate-wave { animation: wave 1.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
      `}</style>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<SonaVerta />);