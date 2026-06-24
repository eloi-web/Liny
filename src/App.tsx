import React from 'react';
import Scanner from './components/Scanner';

export default function App() {
  return (
    <div className="relative w-screen h-screen font-sans text-yellow-white bg-oil-black overflow-hidden">
      <div className="scanline"></div>
      
      {/* HUD Header Overlay */}
      <header className="fixed top-0 left-0 w-full z-50 h-20 flex justify-between items-center px-4 md:px-8 bg-transparent pointer-events-none">
        {/* Floating Title Capsule */}
        <div className="flex items-center px-4 py-2 rounded-xl bg-black/50 border border-yellow-white/10 backdrop-blur-md pointer-events-auto shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
          <h1 className="font-boxlines text-xl md:text-2xl font-bold text-yellow-white tracking-widest leading-none">
            Liny
          </h1>
        </div>

        {/* Floating Action Button Capsule */}
        <div className="flex items-center pointer-events-auto">
          <a 
            href="https://github.com/eloi-web/Liny" 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2.5 rounded-full border border-yellow-white/10 bg-black/50 hover:bg-black/75 hover:border-yellow-white/30 text-yellow-white hover:text-neon-green backdrop-blur-md transition-all flex items-center justify-center group shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
            title="Source Code"
          >
            <svg className="w-5 h-5 group-hover:drop-shadow-[0_0_8px_rgba(254,255,167,0.8)]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"></path>
            </svg>
          </a>
        </div>
      </header>

      {/* Main Content Area - Full screen container */}
      <main className="absolute inset-0 w-full h-full">
        <Scanner />
      </main>
    </div>
  );
}
