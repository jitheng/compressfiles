import React, { useState } from 'react'
import Compressor from './components/Compressor'
import ImageCompressor from './components/ImageCompressor'

export default function App() {
  const [activeTool, setActiveTool] = useState('pdf')

  const isPdf   = activeTool === 'pdf'
  const isImage = activeTool === 'image'

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
            <h1 className="text-lg font-bold text-slate-900 leading-none">CompressFiles</h1>
            <p className="text-xs text-slate-500 mt-0.5">Free · Private · No sign-up</p>
          </div>
        </div>
      </header>

      {/* Tool tab bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 flex gap-0">
          <button
            onClick={() => setActiveTool('pdf')}
            className={[
              'px-5 py-3 text-sm font-semibold border-b-2 transition-colors duration-150',
              isPdf
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
            aria-pressed={isPdf}
          >
            PDF
          </button>
          <button
            onClick={() => setActiveTool('image')}
            className={[
              'px-5 py-3 text-sm font-semibold border-b-2 transition-colors duration-150',
              isImage
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            ].join(' ')}
            aria-pressed={isImage}
          >
            Image
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
        <div className="text-center mb-10">
          {isPdf ? (
            <>
              <h1 className="text-3xl font-extrabold text-slate-900 mb-3">
                Compress PDF Online — Free PDF Compressor
              </h1>
              <p className="text-slate-500 text-base max-w-xl mx-auto">
                Reduce PDF file size by up to 90% instantly. No sign-up, no watermarks.
                Your file is processed securely and deleted immediately after download.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-extrabold text-slate-900 mb-3">
                Compress Images Online — Free Image Compressor
              </h1>
              <p className="text-slate-500 text-base max-w-xl mx-auto">
                Reduce JPG, PNG, and WebP file sizes instantly in your browser.
                No upload needed — compression happens locally on your device.
              </p>
            </>
          )}
        </div>

        {isPdf   && <Compressor />}
        {isImage && <ImageCompressor />}

        {/* SEO feature grid */}
        <section className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center" aria-label="Features">
          <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="text-2xl mb-2" aria-hidden="true">⚡</div>
            <h2 className="font-semibold text-slate-800 mb-1">Up to 90% Smaller</h2>
            <p className="text-sm text-slate-500">Our PDF size reducer re-encodes images at the right quality level — far beyond basic stream compression.</p>
          </div>
          <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="text-2xl mb-2" aria-hidden="true">🔒</div>
            <h2 className="font-semibold text-slate-800 mb-1">100% Private</h2>
            <p className="text-sm text-slate-500">Your files are never stored. PDFs are deleted from the server immediately after download. Images never leave your device — compression runs locally in your browser.</p>
          </div>
          <div className="p-5 rounded-xl bg-white border border-slate-100 shadow-sm">
            <div className="text-2xl mb-2" aria-hidden="true">📱</div>
            <h2 className="font-semibold text-slate-800 mb-1">Works on Any Device</h2>
            <p className="text-sm text-slate-500">Compress PDF files on iPhone, Android, Mac, or PC — no app or software install needed.</p>
          </div>
        </section>

        {/* SEO FAQ / keyword prose */}
        <section className="mt-12 prose prose-slate max-w-none text-sm text-slate-500 space-y-3" aria-label="About File Compression">
          <h2 className="text-base font-semibold text-slate-700 !mt-0">How does the file compressor work?</h2>
          <p>
            Our free online PDF compressor reduces PDF file size by re-encoding embedded images at a lower JPEG quality
            and removing redundant data from the file structure. Unlike tools that only rewrite cross-reference tables,
            we achieve 70–90% reduction on image-heavy PDFs — comparable to desktop tools like Adobe Acrobat or Smallpdf.
          </p>
          <p>
            Choose <strong>Low</strong> compression to preserve near-original quality (ideal for print), <strong>Medium</strong> for
            a balanced size/quality trade-off (email &amp; sharing), or <strong>High</strong> for the smallest possible file (web upload &amp; archiving).
          </p>
          <p className="text-slate-500 text-sm max-w-2xl mx-auto mt-4">
            For images, compression happens entirely in your browser using the Canvas API — your JPG, PNG, or WebP file is re-encoded at your chosen quality level without ever leaving your device. No upload, no server, no storage. Switch to the Image tab above to compress photos instantly.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
          Files are processed in memory and never stored permanently. &nbsp;|&nbsp; Free compressor — no account required.
        </div>
      </footer>
    </div>
  )
}
