// New route entry replacing previous profile.tsx to break Metro stale cache.
console.log('[profile/index.tsx] route module loaded (simple)');
// Forward to the simplified profile screen at app/profile.simple.tsx
export { default } from '../profile.simple';
