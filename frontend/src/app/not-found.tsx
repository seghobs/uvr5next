import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#07090e] text-white p-4">
      <h2 className="text-3xl font-black font-outfit mb-2">404 - Sayfa Bulunamadı</h2>
      <p className="text-slate-400 text-sm mb-6">Aradığınız stüdyo sayfası mevcut değil.</p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all"
      >
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}
