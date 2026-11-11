// Fingerprint / face unlock.
// - Android app: native biometric prompt (@capgo/capacitor-native-biometric, built into APK 1.9.0+).
//   It can also keep the sign-in in the Android Keystore, so you can sign back in with a finger.
// - Everywhere else: the device's own verification through WebAuthn (Touch ID, Face ID, Windows Hello,
//   Android fingerprint in Chrome). Used to unlock a session that already exists on the device.
import { nx, save, emit } from './store';
import { device } from './install';

type Method = 'native' | 'webauthn';
export interface BioInfo { ok: boolean; method?: Method; label: string; reason?: string }
const SERVER = 'nexora.app';

function cap(): any { return (window as any).Capacitor; }
function plugin(): any {
  const C = cap(); if (!C?.isNativePlatform?.()) return null;
  if (C.isPluginAvailable && !C.isPluginAvailable('NativeBiometric')) return null;
  return C.Plugins?.NativeBiometric ?? C.registerPlugin?.('NativeBiometric') ?? null;
}
const NATIVE_TYPES: Record<number, string> = { 1: 'Touch ID', 2: 'Face ID', 3: 'fingerprint', 4: 'face unlock', 5: 'iris', 6: 'fingerprint or face', 7: 'screen lock' };

let cached: BioInfo | null = null;
export async function bioInfo(): Promise<BioInfo> {
  if (cached) return cached;
  const C = cap();
  if (C?.isNativePlatform?.()) {
    const p = plugin();
    if (!p) return (cached = { ok: false, label: 'fingerprint', reason: 'Install the new Android app (1.9.0 or later) from the download page to use your fingerprint.' });
    try {
      const r = await p.isAvailable({ useFallback: false });
      if (!r?.isAvailable) return (cached = { ok: false, label: 'fingerprint', reason: 'No fingerprint is set up on this phone. Add one in your phone settings first.' });
      return (cached = { ok: true, method: 'native', label: NATIVE_TYPES[r.biometryType] ?? 'fingerprint' });
    } catch { return (cached = { ok: false, label: 'fingerprint', reason: 'Fingerprint is not available on this phone.' }); }
  }
  const PKC = (window as any).PublicKeyCredential;
  if (!PKC?.isUserVerifyingPlatformAuthenticatorAvailable || !window.isSecureContext) return (cached = { ok: false, label: 'fingerprint', reason: 'This browser cannot use your fingerprint.' });
  const has = await PKC.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
  const os = device().os;
  const label = os === 'ios' ? 'Face ID or Touch ID' : os === 'mac' ? 'Touch ID' : os === 'windows' ? 'Windows Hello' : 'fingerprint';
  return (cached = has ? { ok: true, method: 'webauthn', label } : { ok: false, label, reason: `This device has no ${label} set up for the browser.` });
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const PROMPT = { title: 'Unlock NEXORA', subtitle: 'Your Mind. Amplified.', reason: 'Unlock NEXORA', description: 'Touch the fingerprint sensor', negativeButtonText: 'Use password' };

/** Ask for the fingerprint once to switch the feature on. */
export async function enable(): Promise<void> {
  const info = await bioInfo(); if (!info.ok) throw new Error(info.reason);
  if (info.method === 'native') {
    await plugin().verifyIdentity({ ...PROMPT, title: 'Turn on fingerprint', description: 'Confirm it is you' });
    nx.bio = { enabled: true, method: 'native', label: info.label, lockAfter: nx.bio?.lockAfter ?? 1 };
  } else {
    const cred = (await navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: 'NEXORA' },
      user: { id: rand(16), name: 'NEXORA', displayName: 'NEXORA' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Cancelled');
    nx.bio = { enabled: true, method: 'webauthn', label: info.label, credId: b64(cred.rawId), lockAfter: nx.bio?.lockAfter ?? 1 };
  }
  save();
}

export async function disable() {
  if (nx.bio?.method === 'native' && nx.bio.savedLogin) await plugin()?.deleteCredentials({ server: SERVER }).catch(() => null);
  nx.bio = { enabled: false, lockAfter: nx.bio?.lockAfter ?? 1 }; save();
}

/** Prompt for the fingerprint. Resolves true when the device confirmed it is you. */
export async function verify(): Promise<boolean> {
  const b = nx.bio; if (!b?.enabled) return true;
  try {
    if (b.method === 'native') { await plugin().verifyIdentity(PROMPT); return true; }
    const a = (await navigator.credentials.get({ publicKey: {
      challenge: rand(32), allowCredentials: b.credId ? [{ type: 'public-key', id: unb64(b.credId) }] : [],
      userVerification: 'required', timeout: 60000,
    } })) as PublicKeyCredential | null;
    if (!a) return false;
    const flags = new Uint8Array((a.response as AuthenticatorAssertionResponse).authenticatorData)[32];
    return (flags & 0x04) !== 0; // UV: the user was verified (fingerprint / face / Hello)
  } catch { return false; }
}

// ---- Android only: keep the sign-in in the Keystore so a finger can sign you back in ----
export const canSaveLogin = () => nx.bio?.enabled && nx.bio.method === 'native';
export async function saveLogin(username: string, password: string) {
  await plugin().setCredentials({ username, password, server: SERVER });
  nx.bio = { ...nx.bio!, savedLogin: true }; save();
}
export async function loginWithFingerprint(): Promise<{ username: string; password: string } | null> {
  if (!canSaveLogin() || !nx.bio?.savedLogin) return null;
  await plugin().verifyIdentity({ ...PROMPT, title: 'Sign in to NEXORA' });
  const c = await plugin().getCredentials({ server: SERVER });
  return c?.username ? { username: c.username, password: c.password } : null;
}

// ---- app lock state ----
export const lock = { locked: false, hiddenAt: 0 };
export function shouldLockOnStart(signedIn: boolean) { return !!(signedIn && nx.bio?.enabled); }
export function lockNow() { if (nx.bio?.enabled) { lock.locked = true; emit(); } }
export function unlock() { lock.locked = false; emit(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { lock.hiddenAt = Date.now(); return; }
  const mins = nx.bio?.lockAfter ?? 1;
  if (nx.bio?.enabled && lock.hiddenAt && Date.now() - lock.hiddenAt >= mins * 60e3) lockNow();
});
