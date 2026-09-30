import React from 'react';

/** Notary seal: thin rings with monospace text on the circle, the application id in the centre. */
export default function Seal({ ring, status, id }) {
  const half = Math.ceil(id.length / 2);
  return (
    <svg className="d-seal" viewBox="0 0 200 200" role="img" aria-label={`${status}: ${ring}. Application ${id}`}>
      <defs>
        <path id="seal-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.2 2.4" />
      <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="64" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text fontSize="8.4" letterSpacing="2.1">
        <textPath href="#seal-ring" startOffset="0">{ring}</textPath>
      </text>
      <text x="100" y="86" textAnchor="middle" fontSize="8.5" fontWeight="700" letterSpacing="1.5" style={{ fill: 'var(--green)' }}>{status}</text>
      <text x="100" y="101" textAnchor="middle" fontSize="6.5" letterSpacing="1.2" opacity="0.65">APP ID</text>
      <text x="100" y="114" textAnchor="middle" fontSize="8">{id.slice(0, half)}</text>
      <text x="100" y="125" textAnchor="middle" fontSize="8">{id.slice(half)}</text>
    </svg>
  );
}
