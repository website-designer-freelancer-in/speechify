import React, { useState, useEffect, useRef } from 'react';
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
  ExternalLink,
  Globe,
  Filter,
  Layout,
  AudioLines,
  Volume1,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

// --- Types ---
interface AudioHistoryItem {
  id: string;
  text: string;
  voice: string;
  voiceLabel: string;
  language: string;
  languageName: string;
  timestamp: string;
  audioData: string; // Base64
}

type Tab = 'editor' | 'history';

interface VoiceOption {
  id: string; // Prebuilt voice name
  label: string; // Display name
  gender: 'Male' | 'Female' | 'Neutral';
  description: string;
  persona: string;
}

interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  localName: string;
  sampleText: string; // Text to speak for preview in this language
}

// --- Utils ---
const decode = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
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

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const sampleCache = useRef<Map<string, string>>(new Map()); // Key: voiceId-langCode

  const voices: VoiceOption[] = [
    { id: 'Kore', label: 'Evelyn', gender: 'Female', description: 'Warm and inviting tones.', persona: 'Storyteller' },
    { id: 'Zephyr', label: 'Caleb', gender: 'Male', description: 'Clear, concise and modern.', persona: 'Tech News' },
    { id: 'Puck', label: 'Finn', gender: 'Male', description: 'High energy and expressive.', persona: 'Commercial' },
    { id: 'Charon', label: 'Winston', gender: 'Male', description: 'Deep, resonant authority.', persona: 'Documentary' },
    { id: 'Fenrir', label: 'Silas', gender: 'Male', description: 'Gravelly and experienced.', persona: 'Old Sage' },
    { id: 'Kore', label: 'Maya', gender: 'Female', description: 'Friendly and professional.', persona: 'Corporate Lead' },
    { id: 'Puck', label: 'Aria', gender: 'Female', description: 'Youthful and vibrant.', persona: 'Social Media' },
    { id: 'Zephyr', label: 'Alex', gender: 'Neutral', description: 'Balanced and instructional.', persona: 'Education' },
  ];

  const languages: LanguageOption[] = [
    { code: 'hi-IN', name: 'Hindi', localName: 'हिन्दी', flag: '🇮🇳', sampleText: 'नमस्ते, यह हिंदी में मेरी आवाज़ का नमूना है।' },
    { code: 'te-IN', name: 'Telugu', localName: 'తెలుగు', flag: '🇮🇳', sampleText: 'నమస్కారం, ఇది తెలుగులో నా స్వరం యొక్క నమూనా.' },
    { code: 'ta-IN', name: 'Tamil', localName: 'தமிழ்', flag: '🇮🇳', sampleText: 'வணக்கம், இது தமிழில் எனது குரலின் மாதிரி.' },
    { code: 'mr-IN', name: 'Marathi', localName: 'मराठी', flag: '🇮🇳', sampleText: 'नमस्कार, हा मराठीतील माझ्या आवाजाचा नमुना आहे.' },
    { code: 'kn-IN', name: 'Kannada', localName: 'ಕನ್ನಡ', flag: '🇮🇳', sampleText: 'ನಮಸ್ಕಾರ, ಇದು ಕನ್ನಡದಲ್ಲಿ ನನ್ನ ಧ್ವನಿಯ ಮಾದರಿಯಾಗಿದೆ.' },
    { code: 'ml-IN', name: 'Malayalam', localName: 'മലയാളം', flag: '🇮🇳', sampleText: 'നമസ്കാരം, ഇത് മലയാളത്തിലുള്ള എന്റെ ശബ്ദത്തിന്റെ മാതൃകയാണ്.' },
    { code: 'bn-IN', name: 'Bengali', localName: 'বাংলা', flag: '🇮🇳', sampleText: 'নমস্কার, এটি বাংলায় আমার কণ্ঠস্বরের একটি नमूना।' },
    { code: 'gu-IN', name: 'Gujarati', localName: 'ગુજરાતી', flag: '🇮🇳', sampleText: 'नमस्ते, आ गुजराती में मारा अवाजनो नमूने छे.' },
    { code: 'en-US', name: 'English (US)', localName: 'English (US)', flag: '🇺🇸', sampleText: 'Hello, this is a sample of my voice in English.' },
    { code: 'en-GB', name: 'English (UK)', localName: 'English (UK)', flag: '🇬🇧', sampleText: 'Greetings, this is how I sound in British English.' },
    { code: 'es-ES', name: 'Spanish', localName: 'Español', flag: '🇪🇸', sampleText: 'Hola, esta es una muestra de mi voz en español.' },
    { code: 'fr-FR', name: 'French', localName: 'Français', flag: '🇫🇷', sampleText: 'Bonjour, voici un échantillon de ma voix en français.' },
    { code: 'de-DE', name: 'German', localName: 'Deutsch', flag: '🇩🇪', sampleText: 'Hallo, dies ist eine Hörprobe meiner Stimme auf Deutsch.' },
    { code: 'ja-JP', name: 'Japanese', localName: '日本語', flag: '🇯🇵', sampleText: 'こんにちは、これは日本語での私の声のサンプルです。' },
  ];

  useEffect(() => {
    const saved = localStorage.getItem('sonaverta_history_v10');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const saveToHistory = (item: AudioHistoryItem) => {
    const newHistory = [item, ...history].slice(0, 50);
    setHistory(newHistory);
    localStorage.setItem('sonaverta_history_v10', JSON.stringify(newHistory));
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('sonaverta_history_v10');
  };

  const playVoiceSample = async (voice: VoiceOption, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedLang) {
      alert("Please select a Language Region first to hear the sample in that language!");
      return;
    }
    if (isPreviewing) return;

    const cacheKey = `${voice.id}-${selectedLang}`;
    const cachedAudio = sampleCache.current.get(cacheKey);
    if (cachedAudio) {
      await playFromBase64(cachedAudio);
      return;
    }
    
    setIsPreviewing(voice.label);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const currentLang = languages.find(l => l.code === selectedLang);
      const sampleText = currentLang?.sampleText || "This is a voice sample.";
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: sampleText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice.id },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        sampleCache.current.set(cacheKey, base64Audio);
        await playFromBase64(base64Audio);
      }
    } catch (error) {
      console.error("Sample preview failed:", error);
    } finally {
      setIsPreviewing(null);
    }
  };

  const generateTTS = async () => {
    if (!text.trim() || isGenerating || !selectedVoice || !selectedLang) return;

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
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
          audioData: base64Audio
        };
        saveToHistory(newItem);
        playFromBase64(base64Audio);
      }
    } catch (error) {
      console.error("TTS Generation failed:", error);
      alert("Synthesis failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const playFromBase64 = async (base64: string) => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e) {}
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const audioBuffer = await decodeAudioData(decode(base64), ctx, 24000, 1);
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => setIsPlaying(false);
    
    source.start(0);
    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const downloadAudio = (item: AudioHistoryItem) => {
    const pcmData = decode(item.audioData);
    const wavBlob = createWavBlob(pcmData, 24000);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SonaVerta-${item.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const createWavBlob = (pcmData: Uint8Array, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, pcmData.length, true);
    return new Blob([header, pcmData], { type: 'audio/wav' });
  };

  const isReadyToGenerate = text.trim().length > 0 && selectedVoice && selectedLang;

  return (
    <div className="flex h-screen bg-[#080b14] text-gray-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <div className="w-80 glass-panel border-r border-white/5 flex flex-col p-6 z-20">
        <div className="flex items-center gap-4 mb-10 px-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Mic className="text-white w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">SonaVerta</h1>
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-black">AI Studio Engine</span>
          </div>
        </div>

        <nav className="flex-1 space-y-3">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${
              activeTab === 'editor' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-gray-500 hover:bg-white/5'
            }`}
          >
            <Settings size={22} />
            <span className="font-bold text-lg">Studio Editor</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all ${
              activeTab === 'history' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20' : 'text-gray-500 hover:bg-white/5'
            }`}
          >
            <History size={22} />
            <span className="font-bold text-lg">Audio Vault</span>
            {history.length > 0 && (
              <span className="ml-auto text-xs bg-black/30 px-2 py-0.5 rounded-full font-bold">{history.length}</span>
            )}
          </button>
        </nav>

        <div className="mt-auto p-5 bg-white/5 rounded-3xl border border-white/5">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="uppercase tracking-widest font-black">Pro Mastering</span>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed mb-4 font-medium">Unique broadcast-quality narration engine supporting 14+ languages.</p>
          <div className="text-[10px] text-indigo-400 flex items-center gap-2 font-bold opacity-70">
            v10.0 Prime Release
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] bg-indigo-600 blur-[140px] rounded-full"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-purple-600 blur-[140px] rounded-full"></div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-10 z-10">
          <div className="max-w-6xl mx-auto w-full">
            {activeTab === 'editor' ? (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <header>
                  <h2 className="text-5xl font-black mb-3 tracking-tight">SonaVerta Studio</h2>
                  <p className="text-gray-500 font-semibold text-lg">Select mandatory options below to synthesize your unique master capture.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-8 space-y-8">
                    <div className="glass-panel p-10 rounded-[3rem] border border-white/10 space-y-5 shadow-2xl">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-[0.3em] text-gray-500 flex items-center gap-2">
                          <Layout size={16} className="text-indigo-400" /> Narrative Script
                        </label>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-indigo-400 font-black">{text.length} CHARS</span>
                          <button onClick={() => setText('')} className="text-xs text-red-400 hover:text-red-300 font-black uppercase tracking-widest transition-colors">Clear</button>
                        </div>
                      </div>
                      <textarea 
                        className="w-full h-[32rem] bg-transparent border-none outline-none text-2xl font-medium resize-none placeholder:text-gray-800 leading-relaxed custom-scrollbar"
                        placeholder="Paste your script here..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-6 bg-white/5 p-8 rounded-[3rem] border border-white/5">
                      <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-gray-400 px-2">
                        <CheckCircle2 size={16} className={selectedLang ? 'text-green-500' : 'text-gray-600'} /> Region {selectedLang ? 'OK' : 'Required'}
                        <CheckCircle2 size={16} className={selectedVoice ? 'text-green-500' : 'text-gray-600'} /> Profile {selectedVoice ? 'OK' : 'Required'}
                        <CheckCircle2 size={16} className={text.trim() ? 'text-green-500' : 'text-gray-600'} /> Script {text.trim() ? 'OK' : 'Required'}
                      </div>
                      
                      <button 
                        onClick={generateTTS}
                        disabled={!isReadyToGenerate || isGenerating}
                        className={`group relative overflow-hidden px-16 py-8 rounded-[2.5rem] font-black text-2xl transition-all flex items-center justify-center gap-4 shadow-2xl ${
                          isReadyToGenerate && !isGenerating 
                          ? 'bg-white text-indigo-950 hover:scale-[1.02] active:scale-95' 
                          : 'bg-white/10 text-white/30 cursor-not-allowed'
                        }`}
                      >
                        {isGenerating ? <Loader2 className="animate-spin" size={32} /> : <Volume2 size={32} />}
                        {isGenerating ? 'Synthesizing Master...' : isReadyToGenerate ? 'Generate Capture' : 'Selection Required'}
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-4 space-y-8">
                    {/* Region Selection */}
                    <div className={`glass-panel p-8 rounded-[2.5rem] border transition-all space-y-6 ${!selectedLang ? 'border-indigo-500/50 shadow-indigo-500/10 shadow-2xl' : 'border-white/10'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Globe size={20} className="text-indigo-400" />
                          <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Region</label>
                        </div>
                        {!selectedLang && <AlertCircle size={16} className="text-indigo-500 animate-pulse" />}
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-[16rem] overflow-y-auto custom-scrollbar pr-2">
                        {languages.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => setSelectedLang(lang.code)}
                            className={`flex items-center gap-4 p-4 rounded-[1.5rem] border transition-all text-left group ${
                              selectedLang === lang.code ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                            }`}
                          >
                            <span className="text-xl">{lang.flag}</span>
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-black block">{lang.name}</span>
                                <span className="text-[10px] opacity-60 font-bold uppercase tracking-widest">{lang.localName}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Profile Selection */}
                    <div className={`glass-panel p-8 rounded-[2.5rem] border transition-all space-y-6 ${!selectedVoice ? 'border-indigo-500/50 shadow-indigo-500/10 shadow-2xl' : 'border-white/10'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Filter size={20} className="text-indigo-400" />
                          <label className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Vocal Profiles</label>
                        </div>
                        {!selectedVoice && <AlertCircle size={16} className="text-indigo-500 animate-pulse" />}
                      </div>
                      <div className="space-y-2 max-h-[30rem] overflow-y-auto custom-scrollbar pr-2">
                        {voices.map((v, idx) => (
                          <div key={`${v.id}-${idx}`} className="relative">
                            <button
                                onClick={() => setSelectedVoice(v.id)}
                                className={`w-full flex items-center gap-4 p-4 rounded-[1.5rem] border transition-all text-left ${
                                selectedVoice === v.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-black shrink-0 ${selectedVoice === v.id ? 'bg-white text-indigo-600' : 'bg-gray-800'}`}>
                                {v.gender === 'Female' ? 'F' : v.gender === 'Male' ? 'M' : 'N'}
                                </div>
                                <div className="flex-1 min-w-0 pr-10">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base font-black truncate">{v.label}</span>
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase ${selectedVoice === v.id ? 'bg-white/20' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                      {v.gender}
                                    </span>
                                  </div>
                                  <p className="text-[9px] opacity-70 font-bold uppercase tracking-widest truncate">{v.persona}</p>
                                </div>
                            </button>
                            <button 
                                onClick={(e) => playVoiceSample(v, e)}
                                title={`Play Sample in ${languages.find(l => l.code === selectedLang)?.name || '...'}`}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                                    selectedVoice === v.id ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white'
                                }`}
                            >
                                {isPreviewing === v.label ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} fill="currentColor" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-5xl font-black mb-3 tracking-tight">Archive Vault</h2>
                    <p className="text-gray-500 font-semibold text-lg">Manage and download your historical SonaVerta captures.</p>
                  </div>
                  {history.length > 0 && (
                    <button 
                      onClick={handleClearHistory}
                      className="flex items-center gap-3 px-6 py-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all font-black uppercase tracking-widest text-xs"
                    >
                      <Trash2 size={18} /> Wipe Vault
                    </button>
                  )}
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {history.length === 0 ? (
                    <div className="col-span-full glass-panel p-24 rounded-[4rem] flex flex-col items-center justify-center border border-dashed border-white/10 opacity-30">
                      <AudioLines size={100} className="mb-8" />
                      <p className="text-3xl font-black uppercase tracking-widest">Vault Empty</p>
                    </div>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="glass-panel p-8 rounded-[3rem] border border-white/10 flex flex-col gap-6 group hover:border-indigo-500/50 transition-all shadow-xl hover:shadow-indigo-500/5">
                        <div className="flex items-start gap-5">
                          <button 
                            onClick={() => playFromBase64(item.audioData)}
                            className="w-16 h-16 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[1.5rem] flex items-center justify-center transition-all shadow-2xl shrink-0 group-hover:scale-110"
                          >
                            <Play size={30} className="ml-1 fill-white" />
                          </button>
                          <div className="flex-1 min-w-0 pt-2">
                            <p className="font-black text-xl leading-tight line-clamp-2 mb-2">{item.text}</p>
                            <div className="flex flex-wrap gap-2">
                                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest bg-indigo-500/10 px-2 py-1 rounded-md">{item.voiceLabel}</span>
                                <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest bg-purple-500/10 px-2 py-1 rounded-md">{item.languageName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-4">
                           <button 
                            onClick={() => downloadAudio(item)}
                            className="flex-1 flex items-center justify-center gap-3 py-4 bg-white/5 border border-white/10 text-gray-300 rounded-[1.25rem] text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all"
                           >
                            <Download size={18} /> Export WAV
                           </button>
                           <button 
                            onClick={() => {
                              const newHistory = history.filter(h => h.id !== item.id);
                              setHistory(newHistory);
                              localStorage.setItem('sonaverta_history_v10', JSON.stringify(newHistory));
                            }}
                            className="p-4 bg-white/5 border border-white/10 text-gray-500 rounded-[1.25rem] hover:bg-red-600/20 hover:text-red-400 transition-all"
                           >
                            <Trash2 size={20} />
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

        {/* Global Player Overlay */}
        {isPlaying && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 glass-panel px-12 py-6 rounded-full border border-indigo-500/40 shadow-2xl z-50 animate-in slide-in-from-bottom-12 duration-500 flex items-center gap-10">
            <div className="flex items-end gap-2 h-10">
              {[...Array(16)].map((_, i) => (
                <div 
                  key={i} 
                  className="w-2 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-full animate-wave" 
                  style={{ animationDelay: `${i * 0.08}s`, height: '40%' }}
                ></div>
              ))}
            </div>
            <div className="flex flex-col">
                <p className="text-sm font-black tracking-[0.3em] uppercase text-indigo-400">Syncing Master Capture</p>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">24kHz 16-bit Master PCM</span>
            </div>
            <button 
              onClick={() => {
                if(sourceNodeRef.current) sourceNodeRef.current.stop();
                setIsPlaying(false);
              }}
              className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full transition-all shadow-xl shadow-red-500/20 active:scale-90"
            >
              <Pause size={24} />
            </button>
          </div>
        )}
      </main>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
        .animate-wave {
          animation: wave 1s ease-in-out infinite;
        }
        .animate-in {
          animation-fill-mode: forwards;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(<SonaVerta />);