"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/browser';
import { Reliability } from '@/types/profile';
import { getErrorMessage } from '@/lib/utils/getErrorMessage';

export function ProfileHeader({
  userId: _userId,
  name,
  location,
  avatarUrl,
  bio,
  reliability,
  editable,
  socials: initialSocials,
  onProfileUpdated,
}: {
  userId?: string | null;
  name: string;
  location?: string;
  avatarUrl?: string;
  bio?: string;
  reliability?: Reliability | null;
  editable?: boolean;
  socials?: SocialHandles;
  onProfileUpdated?: (p: { name?: string; avatarUrl?: string; socials?: SocialHandles; bio?: string; location?: string | null }) => Promise<void> | void;
}) {
  void _userId;
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [pendingName, setPendingName] = useState(name);
  const [pendingBio, setPendingBio] = useState(bio || '');
  const [pendingLocation, setPendingLocation] = useState(location || '');
  const [socials, setSocials] = useState<SocialHandles>(initialSocials || {});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dropZoneRef = useRef<HTMLDivElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locStatus, setLocStatus] = useState<'idle' | 'loading' | 'denied' | 'error'>('idle');
  const [locError, setLocError] = useState<string | null>(null);

  const uploadAvatarBlob = useCallback(async (file: File) => {
    setErrorMsg(null);
    if (!/(jpe?g|png|gif|webp|avif)$/i.test(file.name.split('.').pop() ?? '')) {
      throw new Error('Unsupported file type. Use jpg, png, gif, webp, or avif.');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('File too large (max 2MB).');
    }
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadError) {
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
    await onProfileUpdated?.({ avatarUrl: publicUrl });
  }, [onProfileUpdated]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      await uploadAvatarBlob(file);
    } catch (error) {
      const message = getErrorMessage(error);
      // eslint-disable-next-line no-console
      console.error('Avatar upload failed', error);
      setErrorMsg(`Failed to upload image: ${message}`);
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
  useEffect(() => { setPendingName(name); }, [name]);
  useEffect(() => { setPendingBio(bio || ''); }, [bio]);
  useEffect(() => { setSocials(initialSocials || {}); }, [initialSocials]);
  useEffect(() => { setPendingLocation(location || ''); }, [location]);

  function openEdit() {
    setPendingName(name);
    setPendingBio(bio || '');
    setPendingLocation(location || '');
    setSocials(initialSocials || {});
    setErrorMsg(null);
    setLocError(null);
    setLocStatus('idle');
    setEditOpen(true);
  }

  function resolveLocationFromDevice() {
    if (!('geolocation' in navigator)) {
      setLocError('Location services are not available in this browser.');
      setLocStatus('error');
      return;
    }
    setLocStatus('loading');
    setLocError(null);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
        try {
          const resp = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`);
          if (resp.ok) {
            const result = await resp.json();
            if (result?.label) label = result.label;
          }
        } catch (error) {
          console.warn('[ProfileHeader] reverse geocode failed', error);
        }
        setPendingLocation(label);
        setLocStatus('idle');
      } catch (error) {
        console.warn('[ProfileHeader] processing geolocation failed', error);
        setLocError('Unable to read your location. Try again shortly.');
        setLocStatus('error');
      }
    }, (err) => {
      console.warn('[ProfileHeader] geolocation request denied', err);
      setLocError(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Unable to access your location.');
      setLocStatus('denied');
    }, { enableHighAccuracy: false, timeout: 8000 });
  }

  async function saveEdits() {
    if (!onProfileUpdated) { setEditOpen(false); return; }
    const trimmedName = pendingName.trim();
    if (!trimmedName) {
      setErrorMsg('Display name cannot be empty.');
      return;
    }
    const update: { name?: string; socials?: SocialHandles; bio?: string; location?: string | null } = {};
    if (trimmedName !== name) update.name = trimmedName;

    const cleanedSocials: SocialHandles = {};
    const nextInstagram = socials.instagram?.trim() ?? '';
    const prevInstagram = initialSocials?.instagram?.trim() ?? '';
    if (nextInstagram !== prevInstagram) cleanedSocials.instagram = nextInstagram ? nextInstagram : null;
    const nextWhatsapp = socials.whatsapp?.trim() ?? '';
    const prevWhatsapp = initialSocials?.whatsapp?.trim() ?? '';
    if (nextWhatsapp !== prevWhatsapp) cleanedSocials.whatsapp = nextWhatsapp ? nextWhatsapp : null;
    if (Object.keys(cleanedSocials).length) update.socials = cleanedSocials;

    const nextBio = (pendingBio ?? '').trim();
    if (nextBio !== (bio ?? '')) update.bio = nextBio;

    const nextLocation = pendingLocation.trim().slice(0, 120);
    if (nextLocation !== (location ?? '')) update.location = nextLocation ? nextLocation : null;

    if (!update.name && !update.bio && !update.socials && !('location' in update)) {
      setEditOpen(false);
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      await onProfileUpdated(update);
      setEditOpen(false);
    } catch (error) {
      console.error('Profile save failed', error);
      setErrorMsg(getErrorMessage(error) || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    const node = dropZoneRef.current;
    if (!node) return;

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      setDragActive(true);
    };

    const handleDragLeave = () => {
      setDragActive(false);
    };

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      setDragActive(false);
      const files = event.dataTransfer?.files;
      if (!files || !files.length) return;
      const file = files[0];
      try {
        setUploading(true);
        await uploadAvatarBlob(file);
      } catch (error) {
        console.error('Avatar drop failed', error);
        setErrorMsg(`Failed to upload image: ${getErrorMessage(error)}`);
      } finally {
        setUploading(false);
      }
    };

    node.addEventListener('dragover', handleDragOver);
    node.addEventListener('dragleave', handleDragLeave);
    node.addEventListener('drop', handleDrop);

    return () => {
      node.removeEventListener('dragover', handleDragOver);
      node.removeEventListener('dragleave', handleDragLeave);
      node.removeEventListener('drop', handleDrop);
    };
  }, [uploadAvatarBlob]);

  return (
    <div className="bg-gradient-to-r from-slate-800 via-blue-800 to-blue-900 text-white">
      <div className="max-w-5xl mx-auto px-xl py-xxxl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-xl">
          <div
            ref={dropZoneRef}
            className={`relative w-28 h-28 rounded-full ring-4 ring-white/20 overflow-hidden flex items-center justify-center bg-surface/10 group ${dragActive ? 'ring-emerald-300 ring-offset-2 ring-offset-emerald-200' : ''}`}
          >
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
            <div className="flex items-start gap-sm">
              <h1 className="text-3xl font-bold tracking-tight mb-xxs break-words">{name || 'Profile'}</h1>
              {editable && (
                <button
                  onClick={openEdit}
                  className="mt-xxs inline-flex items-center gap-xxs rounded-md border border-white/20 bg-surface/10 px-xs py-xxs text-xs text-white/80 hover:bg-surface/20 transition"
                >Edit</button>
              )}
            </div>
            {location && <p className="text-white/80 text-sm">📍 {location}</p>}
            {reliability && (
              <div className="mt-md">
                <button
                  onClick={() => setOpen(o=>!o)}
                  className="group inline-flex items-center gap-sm rounded-xl border border-white/15 bg-surface/10 px-lg py-sm backdrop-blur hover:bg-surface/20 transition"
                >
                  <div className="text-left">
                    <div className="text-xs uppercase tracking-wide text-white/60">Reliability Index</div>
                    <div className="flex items-end gap-xs">
                      <span className="text-2xl font-semibold tabular-nums">{Math.round(reliability.score)}</span>
                      <span className="text-xs text-white/60">score</span>
                      <span className="text-sm text-emerald-300 font-medium">{(reliability.confidence*100).toFixed(0)}% conf</span>
                    </div>
                  </div>
                  <svg className={`w-5 h-5 text-white/70 transition-transform ${open?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {open && (
                  <div className="mt-sm grid grid-cols-2 sm:grid-cols-4 gap-sm text-xs">
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
        {errorMsg && (
          <div className="mt-md text-sm text-red-200 bg-surface/10 border border-red-200/40 px-sm py-xs rounded-md max-w-md">
            {errorMsg}
          </div>
        )}
      </div>
  {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setEditOpen(false)} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-xl shadow-lg text-ink">
            <h2 className="text-lg font-semibold mb-md">Edit Profile</h2>
    {errorMsg && <div className="mb-sm rounded-md bg-red-50 border border-red-200 px-sm py-xs text-xs text-red-600">{errorMsg}</div>}
            <label className="block text-sm font-medium text-ink-strong mb-xxs">Display Name</label>
            <input
              value={pendingName}
              onChange={e=>setPendingName(e.target.value)}
        className="w-full mb-md rounded-md border border-midnight-border/60 px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-ink placeholder-ink-muted"
              placeholder="Your name"
            />
            <label className="block text-sm font-medium text-ink-strong mb-xxs">Bio</label>
            <textarea
              value={pendingBio}
              onChange={e=>setPendingBio(e.target.value)}
              rows={3}
              className="w-full mb-md rounded-md border border-midnight-border/60 px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-ink placeholder-ink-muted"
              placeholder="Share a short blurb"
            />
            <label className="block text-sm font-medium text-ink-strong mb-xxs">Location</label>
            <input
              value={pendingLocation}
              onChange={(e) => setPendingLocation(e.target.value.slice(0, 120))}
              placeholder="City, neighbourhood, or leave blank"
              className="w-full rounded-md border border-midnight-border/60 px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-ink placeholder-ink-muted"
            />
            <div className="mt-xs flex flex-wrap items-center gap-xs text-xs text-ink-muted">
              <button
                type="button"
                onClick={resolveLocationFromDevice}
                disabled={locStatus === 'loading'}
                className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/60 px-sm py-xxs text-xs font-medium text-ink-strong hover:bg-surface-alt disabled:opacity-50"
              >
                {locStatus === 'loading' ? 'Locating…' : 'Use my current location'}
              </button>
              {pendingLocation && (
                <button
                  type="button"
                  onClick={() => { setPendingLocation(''); setLocStatus('idle'); setLocError(null); }}
                  className="inline-flex items-center gap-xxs rounded-full border border-midnight-border/40 px-sm py-xxs text-xs text-ink-muted hover:bg-surface-alt"
                >
                  Clear
                </button>
              )}
              <span className="text-[11px] text-ink-muted">Keep it general if you prefer privacy.</span>
            </div>
            {locError && (
              <div className="mt-xs rounded-md bg-amber-50 border border-amber-200 px-sm py-xs text-xs text-amber-700">{locError}</div>
            )}
            <div className="mb-md flex flex-col gap-sm">
              <div className="text-xs font-medium text-ink-strong uppercase tracking-wide">Social Connections</div>
              <div className="grid grid-cols-1 gap-sm">
                <div>
                  <label className="block text-[11px] font-medium text-ink-medium mb-xxs">Instagram Handle</label>
                  <input value={socials.instagram||''} onChange={e=>setSocials(s=>({...s,instagram:cleanInstagramInput(e.target.value)}))} placeholder="yourgram" className="w-full rounded-md border border-midnight-border/60 px-sm py-xs text-xs text-ink placeholder-ink-muted" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-medium mb-xxs">WhatsApp Number</label>
                  <input value={socials.whatsapp||''} onChange={e=>setSocials(s=>({...s,whatsapp:cleanWhatsAppInput(e.target.value)}))} placeholder="+1234567890" className="w-full rounded-md border border-midnight-border/60 px-sm py-xs text-xs text-ink placeholder-ink-muted" />
                  <p className="mt-xxs text-[10px] text-ink-muted">Stored as E.164 (country code + number). No dashes or spaces.</p>
                </div>
              </div>
              <p className="text-[11px] text-ink-muted">Only Instagram & WhatsApp supported currently.</p>
            </div>
            <div className="flex justify-end gap-xs">
              <button onClick={()=>setEditOpen(false)} className="px-md py-xs text-sm rounded-md border border-midnight-border/60 bg-surface hover:bg-surface-alt">Cancel</button>
              <button onClick={saveEdits} disabled={saving || locStatus === 'loading'} className="px-md py-xs text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export type SocialHandles = { instagram?: string | null; whatsapp?: string | null };

function ReliabilityComponent({ label, value, raw }: { label: string; value: number; raw?: boolean }) {
  const pct = raw ? value : Math.round(value);
  return (
    <div className="rounded-lg border border-white/15 bg-surface/5 px-sm py-xs">
      <div className="text-white/60 text-[10px] uppercase tracking-wide mb-hairline">{label}</div>
      <div className="text-sm font-medium tabular-nums">{pct}</div>
    </div>
  );
}
