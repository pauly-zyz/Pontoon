/** Animated diagram: trade fee -> FeeVault -> platform / creator / buyback / rewards. */
export function FeeFlow() {
  const outs = [
    { y: 8, label: "Platform", sub: "PlatformTreasury", color: "var(--color-split-platform)" },
    { y: 76, label: "Creator", sub: "payout (pull)", color: "var(--color-split-creator)" },
    { y: 144, label: "Buyback & burn", sub: "→ 0x…dEaD", color: "var(--color-split-buyback)" },
    { y: 212, label: "Reward holder", sub: "ETH ke staker", color: "var(--color-split-rewards)" },
  ];
  const cy = 130; // vertical center
  return (
    <svg viewBox="0 0 560 260" className="h-auto w-full" role="img" aria-label="Alur fee: trade, FeeVault, lalu platform, creator, buyback, dan reward holder">
      <defs>
        <linearGradient id="ff-vault" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
        <filter id="ff-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* Trade node */}
      <rect x="2" y={cy - 26} width="112" height="52" rx="12" fill="#121d31" stroke="#2a3a57" />
      <text x="58" y={cy - 4} textAnchor="middle" fill="#e7edf7" fontSize="13" fontWeight="600">Trade</text>
      <text x="58" y={cy + 13} textAnchor="middle" fill="#8797b1" fontSize="10.5">Pons V2 · fee 1%</text>

      <path d={`M114 ${cy} H160`} stroke="#5eead4" strokeWidth="2.5" className="flow-line" fill="none" />

      {/* Vault node */}
      <rect x="160" y={cy - 40} width="116" height="80" rx="18" fill="url(#ff-vault)" opacity="0.45" filter="url(#ff-glow)" />
      <rect x="160" y={cy - 40} width="116" height="80" rx="18" fill="url(#ff-vault)" />
      <text x="218" y={cy - 3} textAnchor="middle" fill="#04211d" fontSize="16" fontWeight="700">FeeVault</text>
      <text x="218" y={cy + 15} textAnchor="middle" fill="#064e45" fontSize="10.5">distribute()</text>

      {outs.map((o) => {
        const ty = o.y + 20;
        return (
          <g key={o.label}>
            <path
              d={`M276 ${cy} C 330 ${cy}, 320 ${ty}, 374 ${ty}`}
              stroke={o.color}
              strokeWidth="2.5"
              fill="none"
              className="flow-line"
            />
            <rect x="374" y={o.y} width="182" height="40" rx="11" fill="#0d1524" stroke={o.color} strokeOpacity="0.65" />
            <circle cx="390" cy={ty} r="4.5" fill={o.color} />
            <text x="402" y={ty - 2} fill="#e7edf7" fontSize="12.5" fontWeight="600">{o.label}</text>
            <text x="402" y={ty + 12} fill="#8797b1" fontSize="10">{o.sub}</text>
          </g>
        );
      })}
    </svg>
  );
}
