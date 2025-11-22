import React, { useState, useEffect, useCallback } from 'react';
import { Github, Upload, Play, Settings, Image as ImageIcon, Download, Loader2, AlertCircle, CheckCircle2, Key, Type as TypeIcon } from 'lucide-react';
import { GitHubConfig, BannerStyle, PinConfig, PinData, DEFAULT_BANNER } from './types';
import { verifyGitHubConnection, uploadImageToGitHub } from './services/githubService';
import { analyzeLink, generateImageSection } from './services/aiService';
import { generatePinCanvas } from './utils/canvasUtils';

// Helper to add minutes to date
const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60000);
};

const FONT_OPTIONS = [
    'Playfair Display',
    'Merriweather',
    'Montserrat',
    'Lato',
    'Oswald',
    'Roboto',
    'Dancing Script',
    'Arial',
    'Times New Roman'
];

const App = () => {
  // State: API Key
  const [hasApiKey, setHasApiKey] = useState(false);

  // State: GitHub Config
  const [ghConfig, setGhConfig] = useState<GitHubConfig>({ username: '', repo: '', token: '' });
  const [isGhConnected, setIsGhConnected] = useState(false);
  const [ghChecking, setGhChecking] = useState(false);

  // State: App Config
  const [activeTab, setActiveTab] = useState<'setup' | 'generate' | 'results'>('setup');
  const [bannerStyle, setBannerStyle] = useState<BannerStyle>(DEFAULT_BANNER);
  const [pinConfig, setPinConfig] = useState<PinConfig>({
    links: '',
    topPrompt: 'ingredients on a rustic wooden table',
    bottomPrompt: 'finished dish plated beautifully',
    aspectRatio: '2:3',
    startDate: new Date().toISOString().slice(0, 16)
  });

  // State: Processing
  const [pins, setPins] = useState<PinData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const checkKey = async () => {
      if ((window as any).aistudio && (window as any).aistudio.hasSelectedApiKey) {
        const has = await (window as any).aistudio.hasSelectedApiKey();
        setHasApiKey(has);
      } else {
        // Fallback if running outside aistudio environment, though strictly required per instructions.
        // We'll assume true if the object doesn't exist to avoid blocking dev if not in that specific env.
        // But strictly following instructions:
        // "Assume window.aistudio... are pre-configured"
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if ((window as any).aistudio && (window as any).aistudio.openSelectKey) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  // --- Handlers ---

  const handleConnectGithub = async () => {
    setGhChecking(true);
    const valid = await verifyGitHubConnection(ghConfig);
    setIsGhConnected(valid);
    setGhChecking(false);
    if (!valid) alert("Failed to connect to GitHub. Check credentials.");
  };

  const handleStartGeneration = async () => {
    const urls = pinConfig.links.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (urls.length === 0) return alert("Please add at least one link.");
    if (!isGhConnected) return alert("Please connect GitHub first.");

    setIsProcessing(true);
    setActiveTab('results');

    // Initialize Pins
    const newPins: PinData[] = urls.map(link => ({
      id: Math.random().toString(36).substr(2, 9),
      link,
      status: 'idle',
      keyword: '',
      title: '',
      description: '',
      seoKeywords: ''
    }));
    setPins(newPins);

    // Process Sequentially to manage API limits reasonably
    for (let i = 0; i < newPins.length; i++) {
      await processPin(newPins[i].id);
      setProgress(((i + 1) / newPins.length) * 100);
    }
    
    setIsProcessing(false);
  };

  const processPin = async (pinId: string) => {
    // 1. Analysis
    updatePinStatus(pinId, 'analyzing');
    
    // We need the link from current state
    const currentLink = await new Promise<string>(resolve => {
        setPins(prev => {
            const p = prev.find(x => x.id === pinId);
            resolve(p?.link || '');
            return prev;
        });
    });

    if(!currentLink) return;

    try {
      const analysis = await analyzeLink(currentLink);
      
      setPins(prev => prev.map(p => 
        p.id === pinId ? { ...p, ...analysis } : p
      ));

      // 2. Generate Images
      updatePinStatus(pinId, 'generating_images');
      
      const [topImg, bottomImg] = await Promise.all([
        generateImageSection(pinConfig.topPrompt, analysis.keyword),
        generateImageSection(pinConfig.bottomPrompt, analysis.keyword)
      ]);

      setPins(prev => prev.map(p => 
        p.id === pinId ? { ...p, topImageBase64: topImg, bottomImageBase64: bottomImg } : p
      ));

      // 3. Compose
      updatePinStatus(pinId, 'composing');
      const finalPin = await generatePinCanvas(topImg, bottomImg, analysis.keyword, pinConfig.aspectRatio, bannerStyle);

      setPins(prev => prev.map(p => 
        p.id === pinId ? { ...p, finalPinBase64: finalPin, status: 'ready' } : p
      ));

    } catch (e: any) {
      console.error(e);
      setPins(prev => prev.map(p => 
        p.id === pinId ? { ...p, status: 'error', errorMsg: e.message } : p
      ));
    }
  };

  const updatePinStatus = (id: string, status: PinData['status']) => {
    setPins(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const handleUploadAndExport = async () => {
    if (pins.filter(p => p.status === 'ready').length === 0) return alert("No pins ready to upload.");

    let uploadedCount = 0;
    const initialDate = new Date(pinConfig.startDate);

    const updatedPins = [...pins];

    for (let i = 0; i < updatedPins.length; i++) {
      const pin = updatedPins[i];
      if (pin.status !== 'ready' || !pin.finalPinBase64) continue;

      updatePinStatus(pin.id, 'uploading');

      try {
        const filename = `pin_${pin.keyword.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.jpg`;
        const ghUrl = await uploadImageToGitHub(ghConfig, filename, pin.finalPinBase64);
        
        // Calculate Schedule
        const publishTime = addMinutes(initialDate, uploadedCount * 30);
        
        updatedPins[i] = {
            ...pin,
            status: 'done',
            githubUrl: ghUrl,
            publishDate: publishTime.toISOString()
        };
        
        uploadedCount++;
        setPins([...updatedPins]); // Force update
      } catch (e) {
        updatePinStatus(pin.id, 'error');
      }
    }

    // Generate CSV
    generateCSV(updatedPins.filter(p => p.status === 'done'));
  };

  const generateCSV = (donePins: PinData[]) => {
    const headers = ['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'];
    const rows = donePins.map(p => [
      `"${p.title.replace(/"/g, '""')}"`,
      p.githubUrl,
      "", // Board
      "", // Thumbnail
      `"${p.description.replace(/"/g, '""')}"`,
      p.link,
      p.publishDate, // Format? Pinterest usually likes ISO or simple date
      `"${p.seoKeywords.replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'pinterest_pins_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
        <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 max-w-md w-full text-center space-y-6 shadow-xl">
          <div className="w-16 h-16 bg-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ImageIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Welcome to PinGenius</h1>
            <p className="text-gray-400 text-sm">
              To generate high-quality images using the advanced Gemini models, please select your API key from a paid Google Cloud project.
            </p>
          </div>
          
          <button 
            onClick={handleSelectKey}
            className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02]"
          >
            <Key className="w-5 h-5" />
            Select API Key
          </button>
          
          <div className="text-xs text-gray-500 pt-4 border-t border-gray-700">
            Need a key? <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">View Billing Documentation</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
              <ImageIcon className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-yellow-400 bg-clip-text text-transparent">
              PinGenius Studio
            </h1>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab('setup')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'setup' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              Configuration
            </button>
             <button 
              onClick={() => setActiveTab('generate')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              Data & Prompts
            </button>
             <button 
              onClick={() => setActiveTab('results')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'results' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
            >
              Results ({pins.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6">
        
        {/* TAB: SETUP */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* GitHub Config */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Github className="w-5 h-5 text-purple-400" /> GitHub Connection
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Username</label>
                  <input 
                    type="text" 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    value={ghConfig.username}
                    onChange={(e) => setGhConfig({...ghConfig, username: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Repository Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    value={ghConfig.repo}
                    onChange={(e) => setGhConfig({...ghConfig, repo: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Personal Access Token (PAT)</label>
                  <input 
                    type="password" 
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    value={ghConfig.token}
                    onChange={(e) => setGhConfig({...ghConfig, token: e.target.value})}
                  />
                </div>
                <button 
                  onClick={handleConnectGithub}
                  disabled={ghChecking}
                  className={`w-full py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${isGhConnected ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {ghChecking ? <Loader2 className="animate-spin w-4 h-4" /> : isGhConnected ? <CheckCircle2 className="w-4 h-4" /> : <Github className="w-4 h-4" />}
                  {isGhConnected ? 'Connected' : 'Connect GitHub'}
                </button>
              </div>
            </div>

            {/* Banner Config */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-yellow-400" /> Banner Styling
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Background Color</label>
                    <div className="flex gap-2">
                        <input type="color" value={bannerStyle.backgroundColor} onChange={(e) => setBannerStyle({...bannerStyle, backgroundColor: e.target.value})} className="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                        <input type="text" value={bannerStyle.backgroundColor} onChange={(e) => setBannerStyle({...bannerStyle, backgroundColor: e.target.value})} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs font-mono" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Border Color</label>
                    <div className="flex gap-2">
                        <input type="color" value={bannerStyle.borderColor} onChange={(e) => setBannerStyle({...bannerStyle, borderColor: e.target.value})} className="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                         <input type="text" value={bannerStyle.borderColor} onChange={(e) => setBannerStyle({...bannerStyle, borderColor: e.target.value})} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs font-mono" />
                    </div>
                </div>
                 <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Text Color</label>
                    <div className="flex gap-2">
                        <input type="color" value={bannerStyle.textColor} onChange={(e) => setBannerStyle({...bannerStyle, textColor: e.target.value})} className="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                         <input type="text" value={bannerStyle.textColor} onChange={(e) => setBannerStyle({...bannerStyle, textColor: e.target.value})} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs font-mono" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Text Stroke Color</label>
                    <div className="flex gap-2">
                        <input type="color" value={bannerStyle.textBorderColor} onChange={(e) => setBannerStyle({...bannerStyle, textBorderColor: e.target.value})} className="h-8 w-8 rounded cursor-pointer bg-transparent border-0" />
                         <input type="text" value={bannerStyle.textBorderColor} onChange={(e) => setBannerStyle({...bannerStyle, textBorderColor: e.target.value})} className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 text-xs font-mono" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Text Border Width (0 to remove)</label>
                    <div className="flex items-center gap-2">
                         <input 
                            type="range" 
                            min="0" 
                            max="10" 
                            step="1"
                            value={bannerStyle.textBorderWidth} 
                            onChange={(e) => setBannerStyle({...bannerStyle, textBorderWidth: parseInt(e.target.value)})} 
                            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" 
                        />
                        <span className="text-xs font-mono w-6">{bannerStyle.textBorderWidth}px</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Font Family</label>
                    <div className="relative">
                         <select 
                            value={bannerStyle.fontFamily} 
                            onChange={(e) => setBannerStyle({...bannerStyle, fontFamily: e.target.value})} 
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm appearance-none focus:ring-1 focus:ring-purple-500"
                        >
                            {FONT_OPTIONS.map(font => (
                                <option key={font} value={font}>{font}</option>
                            ))}
                        </select>
                         <TypeIcon className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                </div>
              </div>
              
              <div className="mt-6 border-t border-gray-700 pt-4">
                <label className="block text-xs font-medium text-gray-400 mb-2">Live Preview (Banner Only)</label>
                <div className="w-full h-32 flex items-center justify-center bg-white rounded-lg overflow-hidden relative">
                    <div 
                        className="w-[380px] h-[100px] flex items-center justify-center relative border-4 border-dashed"
                        style={{ 
                            backgroundColor: bannerStyle.backgroundColor,
                            borderColor: bannerStyle.borderColor
                        }}
                    >
                        <span 
                            className="text-4xl font-bold relative z-10 text-center leading-tight"
                            style={{ 
                                color: bannerStyle.textColor, 
                                WebkitTextStroke: bannerStyle.textBorderWidth > 0 ? `${bannerStyle.textBorderWidth}px ${bannerStyle.textBorderColor}` : 'none',
                                fontFamily: bannerStyle.fontFamily,
                            }}
                        >
                            Best Recipe
                        </span>
                    </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: GENERATE */}
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
            <div className="lg:col-span-2 space-y-6">
               <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                  <label className="block text-sm font-medium text-white mb-2">Recipe Links (One per line)</label>
                  <textarea 
                    className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                    placeholder="https://example.com/best-lasagna-recipe&#10;https://example.com/chocolate-cake"
                    value={pinConfig.links}
                    onChange={(e) => setPinConfig({...pinConfig, links: e.target.value})}
                  />
               </div>
            </div>

            <div className="space-y-6">
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="font-semibold mb-4">Image Prompts</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Top Image Prompt</label>
                            <textarea 
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm h-20 resize-none"
                                value={pinConfig.topPrompt}
                                onChange={(e) => setPinConfig({...pinConfig, topPrompt: e.target.value})}
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Bottom Image Prompt</label>
                             <textarea 
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm h-20 resize-none"
                                value={pinConfig.bottomPrompt}
                                onChange={(e) => setPinConfig({...pinConfig, bottomPrompt: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <h3 className="font-semibold mb-4">Settings</h3>
                    <div className="space-y-4">
                         <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Aspect Ratio</label>
                            <select 
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm"
                                value={pinConfig.aspectRatio}
                                onChange={(e) => setPinConfig({...pinConfig, aspectRatio: e.target.value as any})}
                            >
                                <option value="2:3">2:3 (1000 x 1500)</option>
                                <option value="1:2">1:2 (1000 x 2100)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Start Upload Date</label>
                            <input 
                                type="datetime-local" 
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm"
                                value={pinConfig.startDate}
                                onChange={(e) => setPinConfig({...pinConfig, startDate: e.target.value})}
                            />
                            <p className="text-xs text-gray-500 mt-1">Pins will be scheduled 30 mins apart.</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleStartGeneration}
                        disabled={isProcessing}
                        className="w-full mt-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transform transition hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? <Loader2 className="animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                        Generate All Pins
                    </button>
                </div>
            </div>
          </div>
        )}

        {/* TAB: RESULTS */}
        {activeTab === 'results' && (
          <div className="h-full flex flex-col">
            
            {/* Toolbar */}
            <div className="bg-gray-800 p-4 rounded-xl mb-6 flex justify-between items-center border border-gray-700">
               <div>
                  <h2 className="text-lg font-bold">Generated Queue</h2>
                  {isProcessing && (
                      <div className="flex items-center gap-2 text-sm text-yellow-400 mt-1">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing: {Math.round(progress)}%
                      </div>
                  )}
               </div>
               <button 
                onClick={handleUploadAndExport}
                disabled={isProcessing || pins.every(p => p.status === 'idle')}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                 <Upload className="w-5 h-5" />
                 Upload to GitHub & Export CSV
               </button>
            </div>

            {/* Grid */}
            {pins.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 flex-col gap-4">
                    <ImageIcon className="w-16 h-16 opacity-20" />
                    <p>No pins generated yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                    {pins.map(pin => (
                        <div key={pin.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
                            {/* Preview Area */}
                            <div className="aspect-[2/3] bg-gray-900 relative group">
                                {pin.status === 'error' ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-red-500 flex-col p-4 text-center">
                                        <AlertCircle className="w-10 h-10 mb-2" />
                                        <p className="text-xs">{pin.errorMsg}</p>
                                    </div>
                                ) : pin.finalPinBase64 ? (
                                    <img src={pin.finalPinBase64} alt={pin.keyword} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 flex-col gap-2">
                                        <Loader2 className={`w-8 h-8 ${['analyzing', 'generating_images', 'composing'].includes(pin.status) ? 'animate-spin text-purple-500' : ''}`} />
                                        <span className="text-xs uppercase tracking-wider font-bold">{pin.status.replace('_', ' ')}</span>
                                    </div>
                                )}
                                
                                {/* Hover Info */}
                                {pin.finalPinBase64 && (
                                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity p-4 overflow-y-auto text-xs space-y-2">
                                        <p><strong className="text-purple-400">Title:</strong> {pin.title}</p>
                                        <p><strong className="text-purple-400">Keyword:</strong> {pin.keyword}</p>
                                        <p><strong className="text-purple-400">SEO:</strong> {pin.seoKeywords}</p>
                                        <div className="pt-2 border-t border-gray-700">
                                            <p className="text-gray-400 truncate">{pin.link}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer Status */}
                            <div className="p-3 bg-gray-850 border-t border-gray-700 flex justify-between items-center">
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                    pin.status === 'done' ? 'bg-green-900/50 text-green-400' :
                                    pin.status === 'ready' ? 'bg-blue-900/50 text-blue-400' :
                                    pin.status === 'error' ? 'bg-red-900/50 text-red-400' :
                                    'bg-gray-700 text-gray-400'
                                }`}>
                                    {pin.status.toUpperCase()}
                                </span>
                                {pin.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;