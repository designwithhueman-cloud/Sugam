// Decorative line illustrations for the FAQ and the closing banner (stroke-only drawings with a lime wash).
// Hidden from assistive technology.
const line = { fill: 'none', stroke: '#111', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function FaqArt({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 300 230" className={className} {...line}>
      <ellipse cx="150" cy="118" rx="140" ry="90" fill="#e6f9b6" stroke="none" />
      <path d="M52 44 h134 a16 16 0 0 1 16 16 v56 a16 16 0 0 1 -16 16 h-74 l-28 24 v-24 h-32 a16 16 0 0 1 -16 -16 v-56 a16 16 0 0 1 16 -16z" fill="#fff" />
      <path d="M104 78 a15 15 0 1 1 26 10 c-6 5 -11 9 -11 17" /><circle cx="119" cy="124" r="2.6" fill="#111" stroke="none" />
      <path d="M172 134 h72 a14 14 0 0 1 14 14 v30 a14 14 0 0 1 -14 14 h-12 v20 l-24 -20 h-36 a14 14 0 0 1 -14 -14 v-30 a14 14 0 0 1 14 -14z" fill="#d9f56e" />
      <path d="M190 163 l12 12 l26 -28" />
      <path d="M232 36 v14 M225 43 h14" stroke="#5b2fd0" /><path d="M262 92 v10 M257 97 h10" stroke="#5b2fd0" />
    </svg>
  );
}

export function CtaArt({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 320 230" className={className} {...line}>
      <ellipse cx="160" cy="118" rx="150" ry="95" fill="#f6ffd9" stroke="none" />
      <rect x="40" y="44" width="200" height="146" rx="18" fill="#fff" />
      <path d="M40 74 H240" /><circle cx="58" cy="59" r="3.5" fill="#111" stroke="none" /><circle cx="71" cy="59" r="3.5" fill="#111" stroke="none" /><circle cx="84" cy="59" r="3.5" fill="#111" stroke="none" />
      <path d="M40 108 H240" />
      <rect x="194" y="82" width="30" height="20" rx="6" stroke="#5b2fd0" strokeWidth="3.5" fill="#fff" /><path d="M202 88 H216 M202 94 H216" strokeWidth="2" />
      <rect x="58" y="124" width="68" height="48" rx="10" fill="#d9f56e" /><path d="M140 130 H220 M140 144 H200 M140 158 H214" />
      <circle cx="252" cy="62" r="30" fill="#111" stroke="#111" /><path d="M238 62 l10 10 l19 -22" stroke="#d9f56e" strokeWidth="4" />
      <path d="M278 120 v14 M271 127 h14" stroke="#5b2fd0" /><path d="M24 150 v10 M19 155 h10" stroke="#5b2fd0" />
    </svg>
  );
}
