import React from 'react'
import Compressor from './components/Compressor'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#4f6ef7"/>
            <path d="M9 8h10l4 4v12H9V8z" fill="white" opacity="0.9"/>
            <path d="M19 8l4 4h-4V8z" fill="#c7d2fe"/>
            <text x="16" y="22" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#4f6ef7" fontFamily="sans-serif">PDF</text>
          </svg>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-none">PDF Compressor</h1>
            <p className="text-xs text-slate-500 mt-0.5">Free · Private · No sign-up</p>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-900 mb-3">
            Compress your PDF in seconds
          </h2>
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            Reduce PDF file size without losing quality. Your file is processed
            server-side and deleted immediately after download.
          </p>
        </div>
        <Compressor />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
          Files are processed in memory and never stored permanently.
        </div>
      </footer>
    </div>
  )
}
