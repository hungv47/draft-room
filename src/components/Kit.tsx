"use client";

import { useId, type JSX } from "react";
import type { Kit } from "@/lib/kits";

const SHIRT_D =
  "M 40 14.5 C 31.5 15.5 27 18 25.2 21.2 C 16.5 23 10.5 25.5 8.2 29 C 7.2 33 7.2 39.5 8.4 43.2 C 9.8 45.8 13.4 46.4 16.8 44.8 L 26 39.2 C 26.3 54 26.8 70 27.2 82 C 27.4 87 29.2 91 34 92.4 C 39.2 94 44.8 94.6 50 94.6 C 55.2 94.6 60.8 94 66 92.4 C 70.8 91 72.6 87 72.8 82 C 73.2 70 73.7 54 74 39.2 L 83.2 44.8 C 86.6 46.4 90.2 45.8 91.6 43.2 C 92.8 39.5 92.8 33 91.8 29 C 89.5 25.5 83.5 23 74.8 21.2 C 73 18 68.5 15.5 60 14.5 C 56.2 21.2 53 25.4 50 26.8 C 47 25.4 43.8 21.2 40 14.5 Z";

const SLEEVE_LEFT_D =
  "M 25.2 21.2 C 16.5 23 10.5 25.5 8.2 29 C 7.2 33 7.2 39.5 8.4 43.2 C 9.8 45.8 13.4 46.4 16.8 44.8 L 26 39.2 C 25.8 33.2 25.6 26.8 25.2 21.2 Z";

const SLEEVE_RIGHT_D =
  "M 74.8 21.2 C 83.5 23 89.5 25.5 91.8 29 C 92.8 33 92.8 39.5 91.6 43.2 C 90.2 45.8 86.6 46.4 83.2 44.8 L 74 39.2 C 74.2 33.2 74.4 26.8 74.8 21.2 Z";

const COLLAR_D = "M 40 14.5 C 43.8 21.2 47 25.4 50 26.8 C 53 25.4 56.2 21.2 60 14.5";

const CUFF_LEFT_D = "M 8.2 29 C 7.2 33 7.2 39.5 8.4 43.2";

const CUFF_RIGHT_D = "M 91.8 29 C 92.8 33 92.8 39.5 91.6 43.2";

const SEAM_LEFT_D = "M 16.8 44.8 L 26 39.2";

const SEAM_RIGHT_D = "M 83.2 44.8 L 74 39.2";

const SHOULDER_LEFT_D = "M 25.2 21.2 C 31.5 15.8 40 14.5 44.5 15.2";

const SHOULDER_RIGHT_D = "M 74.8 21.2 C 68.5 15.8 60 14.5 55.5 15.2";

const STRIPE_WIDTH = 100 / 11;
const HOOP_HEIGHT = 100 / 9;
const PINSTRIPE_X = [2, 9, 16, 23, 30, 37, 44, 51, 58, 65, 72, 79, 86, 93] as const;

export function Kit({
  kit,
  size = 64,
  className,
  title,
}: {
  kit: Kit;
  size?: number;
  className?: string;
  title?: string;
}): JSX.Element {
  return <Shirt kit={kit} size={size} className={className} title={title} seams />;
}

export function KitMini({
  kit,
  size = 28,
  className,
  title,
}: {
  kit: Kit;
  size?: number;
  className?: string;
  title?: string;
}): JSX.Element {
  return <Shirt kit={kit} size={size} className={className} title={title} seams={false} />;
}

function Shirt({
  kit,
  size,
  className,
  title,
  seams,
}: {
  kit: Kit;
  size: number;
  className: string | undefined;
  title: string | undefined;
  seams: boolean;
}): JSX.Element {
  const uid = useId().replaceAll(":", "");
  const clipId = `${uid}-clip`;
  const shadeId = `${uid}-shade`;
  const leftShadeId = `${uid}-side-l`;
  const rightShadeId = `${uid}-side-r`;
  const label = title ?? "Kit";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      aria-hidden={title ? undefined : true}
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHIRT_D} />
        </clipPath>
        <linearGradient id={shadeId} x1="18%" y1="8%" x2="86%" y2="92%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={leftShadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={kit.secondary} stopOpacity="0.38" />
          <stop offset="100%" stopColor={kit.secondary} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={rightShadeId} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={kit.secondary} stopOpacity="0.38" />
          <stop offset="100%" stopColor={kit.secondary} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect width="100" height="100" fill={kit.primary} />
        <PatternFills kit={kit} leftShadeId={leftShadeId} rightShadeId={rightShadeId} />
        <rect width="100" height="100" fill={`url(#${shadeId})`} />
        {seams ? (
          <g
            fill="none"
            stroke="#000000"
            strokeOpacity="0.26"
            strokeWidth="1"
            strokeLinecap="round"
          >
            <path d={SEAM_LEFT_D} />
            <path d={SEAM_RIGHT_D} />
          </g>
        ) : null}
        <g
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.38"
          strokeWidth="1.35"
          strokeLinecap="round"
        >
          <path d={SHOULDER_LEFT_D} />
          <path d={SHOULDER_RIGHT_D} />
        </g>
      </g>

      <g
        clipPath={`url(#${clipId})`}
        fill="none"
        stroke={kit.trim}
        strokeLinecap="butt"
        strokeLinejoin="round"
      >
        <path d={COLLAR_D} strokeWidth="5" />
        <path d={CUFF_LEFT_D} strokeWidth="6" />
        <path d={CUFF_RIGHT_D} strokeWidth="6" />
      </g>

      <path d={SHIRT_D} fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="0.9" />
    </svg>
  );
}

function PatternFills({
  kit,
  leftShadeId,
  rightShadeId,
}: {
  kit: Kit;
  leftShadeId: string;
  rightShadeId: string;
}): JSX.Element | null {
  switch (kit.pattern) {
    case "plain":
      return (
        <g>
          <rect x="8" y="0" width="24" height="100" fill={`url(#${leftShadeId})`} />
          <rect x="68" y="0" width="24" height="100" fill={`url(#${rightShadeId})`} />
        </g>
      );
    case "stripes":
      return (
        <g fill={kit.secondary}>
          <rect x={STRIPE_WIDTH} y="0" width={STRIPE_WIDTH} height="100" />
          <rect x={STRIPE_WIDTH * 3} y="0" width={STRIPE_WIDTH} height="100" />
          <rect x={STRIPE_WIDTH * 5} y="0" width={STRIPE_WIDTH} height="100" />
          <rect x={STRIPE_WIDTH * 7} y="0" width={STRIPE_WIDTH} height="100" />
          <rect x={STRIPE_WIDTH * 9} y="0" width={STRIPE_WIDTH} height="100" />
        </g>
      );
    case "hoops":
      return (
        <g fill={kit.secondary}>
          <rect x="0" y={HOOP_HEIGHT} width="100" height={HOOP_HEIGHT} />
          <rect x="0" y={HOOP_HEIGHT * 3} width="100" height={HOOP_HEIGHT} />
          <rect x="0" y={HOOP_HEIGHT * 5} width="100" height={HOOP_HEIGHT} />
          <rect x="0" y={HOOP_HEIGHT * 7} width="100" height={HOOP_HEIGHT} />
        </g>
      );
    case "halves":
      return <rect x="0" y="0" width="50" height="100" fill={kit.secondary} />;
    case "sleeves":
      return (
        <g fill={kit.secondary}>
          <path d={SLEEVE_LEFT_D} />
          <path d={SLEEVE_RIGHT_D} />
        </g>
      );
    case "sash":
      return <polygon points="12,8 32,8 100,96 80,96" fill={kit.secondary} />;
    case "pinstripes":
      return (
        <g fill={kit.secondary}>
          {PINSTRIPE_X.map((x) => (
            <rect key={x} x={x} y="0" width="1.2" height="100" />
          ))}
        </g>
      );
  }
}
