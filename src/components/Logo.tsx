'use client';

import React from 'react';

export function LogoIcon({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer crescent */}
      <path
        d="M 90,30 C 65,12 30,28 25,60 C 20,92 48,112 80,102 C 90,98 94,88 85,88 C 65,88 40,78 40,60 C 40,42 68,36 85,46 C 94,52 98,36 90,30 Z"
        fill="#2D5FB7"
      />
      {/* Inner crescent helper for thickness and look */}
      <path
        d="M 80,42 C 60,32 38,45 36,64 C 34,83 50,96 72,92 C 80,90 84,86 78,82 C 62,82 48,74 48,60 C 48,46 68,44 78,48 C 84,50 84,44 80,42 Z"
        fill="#2D5FB7"
        opacity="0.6"
      />
      {/* Three upward-pointing chevrons */}
      <path
        d="M 45,78 L 60,65 L 75,78"
        stroke="#E15228"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 45,64 L 60,51 L 75,64"
        stroke="#E15228"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 45,50 L 60,37 L 75,50"
        stroke="#E15228"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoFull({ size = 50, light = false }: { size?: number; light?: boolean }) {
  const height = size;
  const width = size * 4; // aspect ratio is roughly 4:1
  
  const textColorQuas = light ? '#FFFFFF' : '#2D5FB7';
  const textColorTech = '#E15228';
  const subtextColorIso = light ? '#B9C2DD' : '#555555';
  const subtextColorFuture = '#E15228';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', userSelect: 'none' }}>
      <LogoIcon size={size} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize: `${size * 0.46}px`,
              color: textColorQuas,
              letterSpacing: '-0.5px',
            }}
          >
            QUAS
          </span>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 800,
              fontSize: `${size * 0.46}px`,
              color: textColorTech,
              letterSpacing: '-0.5px',
            }}
          >
            TECH
          </span>
          <span
            style={{
              fontSize: `${size * 0.2}px`,
              fontWeight: 'bold',
              color: textColorTech,
              marginLeft: '2px',
              marginTop: '-2px',
            }}
          >
            ®
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '2px',
            width: '100%',
            fontSize: `${size * 0.16}px`,
            lineHeight: 1,
            gap: '8px',
          }}
        >
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              color: subtextColorIso,
              whiteSpace: 'nowrap',
            }}
          >
            ISO 9001 : 2015
          </span>
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontWeight: 'bold',
              color: subtextColorFuture,
              whiteSpace: 'nowrap',
            }}
          >
            FUTURE through Innovations
          </span>
        </div>
      </div>
    </div>
  );
}
