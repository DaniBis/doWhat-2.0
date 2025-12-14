"use client";
import { useEffect, useState } from 'react';

export function BioCard({ bio: initialBio, editable, onSave }: { bio?: string; editable?: boolean; onSave?: (bio: string)=>Promise<void>|void }) {
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(initialBio || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setBio(initialBio || ''); }, [initialBio]);
  async function handleSave() {
    if (!onSave) return;
    setSaving(true); setMsg('');
    try {
      await onSave(bio);
      setMsg('Saved');
      setEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      setMsg(message);
    }
    finally { setSaving(false); }
  }
  return (
    <div className="rounded-xl bg-surface border border-midnight-border/40 p-lg shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-sm">
        <h3 className="font-semibold text-ink-strong">About</h3>
        {editable && (
          <button onClick={()=> setEditing(e=>!e)} className="text-xs px-xs py-xxs rounded border border-midnight-border/60 hover:bg-surface-alt">{editing ? 'Cancel' : 'Edit'}</button>
        )}
      </div>
      {!editing && (
        <p className="text-sm text-ink-strong whitespace-pre-wrap min-h-[48px]">{bio || 'No bio yet.'}</p>
      )}
      {editing && (
        <div className="space-y-xs">
          <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={4} className="w-full rounded border border-midnight-border/60 p-xs text-sm" placeholder="Write something about yourself" />
          <div className="flex items-center gap-xs">
            <button disabled={saving} onClick={handleSave} className="px-sm py-1.5 text-xs rounded bg-blue-600 text-white disabled:opacity-50">{saving?'Saving…':'Save'}</button>
            {msg && <span className="text-xs text-ink-muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
