"use client";
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { Reliability } from '@/types/profile';

export function ProfileHeader({
  userId,
  name,
  location,
  avatarUrl,
  reliability,
  editable,
  socials: initialSocials,
  onProfileUpdated,
}: {
  userId?: string | null;
  name: string;
  location?: string;
  avatarUrl?: string;
  reliability?: Reliability | null;
  editable?: boolean;
  socials?: SocialHandles;
  onProfileUpdated?: (p: { name?: string; avatarUrl?: string; socials?: SocialHandles }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingName, setPendingName] = useState(name);
  const [socials, setSocials] = useState<SocialHandles>(initialSocials || {});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setErrorMsg(null);
      setUploading(true);
      const ext = file.name.split('.').pop();
      // Store object directly (optionally nest by userId later). Avoid prefixing bucket name again.
      const path = `${crypto.randomUUID()}.${ext}`;
      if (!/(jpe?g|png|gif|webp|avif)$/i.test(ext||'')) {
        throw new Error('Unsupported file type. Use jpg, png, gif, webp, or avif.');
      }
      if (file.size > 2*1024*1024) { // 2MB limit
        throw new Error('File too large (max 2MB).');
      }
      // Single bucket strategy (public bucket). Requires INSERT policy if private or RLS enforced.
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (uploadError) {
        // Provide friendlier guidance for common RLS / bucket issues
        if (/row level security/i.test(uploadError.message) || /row-level security/i.test(uploadError.message)) {
          throw new Error('Upload blocked by RLS policy. Add an INSERT policy on storage.objects for bucket "avatars" allowing authenticated users.');
        }
        if (/bucket not found/i.test(uploadError.message)) {
          throw new Error('Bucket "avatars" not found. Create it in Supabase Storage.');
        }
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('Could not generate public URL.');
      onProfileUpdated?.({ avatarUrl: publicUrl });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('Avatar upload failed', err);
      setErrorMsg(err?.message ? `Failed to upload image: ${err.message}` : 'Failed to upload image');
    } finally {
      setUploading(false);
      // Allow re-selecting the same file after failure/success
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function cleanInstagramInput(v: string) {
    let val = v.trim();
    if (!val) return '';
    // Strip whitespace & @ symbols
    val = val.replace(/@/g, '').replace(/\s+/g, '');
    // Remove full URL or domain prefixes if pasted
    val = val.replace(/^https?:\/\/([^/]*instagram\.com)\//i, '');
    val = val.replace(/^instagram\.com\//i, '');
    val = val.replace(/^www\.instagram\.com\//i, '');
    // Remove query / fragment / trailing slashes
    val = val.split(/[?#]/)[0].replace(/\/+$/,'');
    return val;
  }

  function cleanWhatsAppInput(v: string) {
    let val = v.trim();
    if (!val) return '';
    // Remove common URL prefixes (api.whatsapp.com/send?phone=, wa.me/)
    val = val
      .replace(/^https?:\/\/wa\.me\//i, '')
      .replace(/^https?:\/\/api\.whatsapp\.com\/send\?phone=/i, '')
      .replace(/^wa\.me\//i, '')
      .replace(/^api\.whatsapp\.com\/send\?phone=/i, '');
    // Strip non-digit plus characters except leading +
    val = val.replace(/[^+\d]/g, '');
    // Ensure only one leading +
    val = val.replace(/^(\++)/, '+');
    // Basic length cap (15 digits ITU E.164 max excluding +)
    if (val.startsWith('+')) {
      const digits = val.slice(1).replace(/\D/g,'').slice(0,15);
      val = '+'+digits;
    } else {
      val = val.replace(/\D/g,'').slice(0,15);
    }
    return val;
  }

  // Load socials from localStorage when modal opens
  function openEdit() { setPendingName(name); setEditOpen(true); }

  function saveEdits() {
    const update: { name?: string; socials?: SocialHandles } = {};
    if (pendingName && pendingName !== name) update.name = pendingName;
    update.socials = socials;
    onProfileUpdated?.(update);
    setEditOpen(false);
  }
  return (
    <div className="bg-gradient-to-r from-slate-800 via-blue-800 to-blue-900 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative w-28 h-28 rounded-full ring-4 ring-white/20 overflow-hidden flex items-center justify-center bg-white/10 group">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl">👤</span>
            )}
            {editable && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-medium tracking-wide transition"
              >{uploading ? 'Uploading…' : 'Change'}</button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              <h1 className="text-3xl font-bold tracking-tight mb-1 break-words">{name || 'Profile'}</h1>
              {editable && (
                <button
                  onClick={openEdit}
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20 transition"
                >Edit</button>
              )}
            </div>
            {location && <p className="text-white/80 text-sm">📍 {location}</p>}
            {reliability && (
              <div className="mt-4">
                <button
                  onClick={() => setOpen(o=>!o)}
                  className="group inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur hover:bg-white/20 transition"
                >
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-wide text-white/60">Reliability Index</div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-semibold tabular-nums">{Math.round(reliability.score)}</span>
                      <span className="text-xs text-white/60">score</span>
                      <span className="text-sm text-emerald-300 font-medium">{(reliability.confidence*100).toFixed(0)}% conf</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-white/70 transition-transform ${open?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {open && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <ReliabilityComponent label="AS30" value={reliability.components.AS30} />
                    <ReliabilityComponent label="AS90" value={reliability.components.AS90} />
                    {reliability.components.reviewScore !== undefined && <ReliabilityComponent label="Review" value={reliability.components.reviewScore} />}
                    {reliability.components.hostBonus !== undefined && <ReliabilityComponent label="Host+" value={reliability.components.hostBonus} raw />}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setEditOpen(false)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-lg text-gray-900">
            <h2 className="text-lg font-semibold mb-4">Edit Profile</h2>
    {errorMsg && <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{errorMsg}</div>}
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
            <input
              value={pendingName}
              onChange={e=>setPendingName(e.target.value)}
        className="w-full mb-4 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-400"
              placeholder="Your name"
            />
            <div className="mb-4 flex flex-col gap-3">
              <div className="text-xs font-medium text-gray-700 uppercase tracking-wide">Social Connections</div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">Instagram Handle</label>
                  <input value={socials.instagram||''} onChange={e=>setSocials(s=>({...s,instagram:cleanInstagramInput(e.target.value)}))} placeholder="yourgram" className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 placeholder-gray-400" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">WhatsApp Number</label>
                  <input value={socials.whatsapp||''} onChange={e=>setSocials(s=>({...s,whatsapp:cleanWhatsAppInput(e.target.value)}))} placeholder="+1234567890" className="w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-900 placeholder-gray-400" />
                  <p className="mt-1 text-[10px] text-gray-500">Stored as E.164 (country code + number). No dashes or spaces.</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Only Instagram & WhatsApp supported currently.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setEditOpen(false)} className="px-4 py-2 text-sm rounded-md border border-gray-300 bg-white hover:bg-gray-50">Cancel</button>
              <button onClick={saveEdits} className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type SocialHandles = { instagram?: string; whatsapp?: string };

function ReliabilityComponent({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  const pct = raw ? value : Math.round(value);
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2">
      <div className="text-white/60 text-[10px] uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm font-medium tabular-nums">{pct}</div>
    </div>
  );
}
