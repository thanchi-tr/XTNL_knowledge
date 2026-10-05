/**
 * The two WebGL1 programs (ui-motion.md §6.3), GLSL ES 1.00, hand-written. Reached
 * only through the runtime (an import() chunk); shader-check lints the sources.
 *
 *   VERT      one full-screen triangle
 *   PRELUDE   precision guard, the shared uniforms, noise, dither, premul
 *   HORIZON   the dawn and its air. No path, front, contour or hairline: every
 *             measured mark is SVG above the canvas (D15). No uniform carries
 *             Proficiency; the dawn's strength is the constant cap.
 *   WEAVE     a standing wave (only the amplitude breathes): nothing travels,
 *             there is no fill direction, and the edges fade both ways.
 *   BINDERS   the uniform values per frame (≤ 4 vec4 each, matching the
 *             declared uniforms exactly).
 */
import { LIMITS, type Rgb, type ShaderProgram } from "./params";

export const VERT = "attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*0.5+0.5;gl_Position=vec4(a_pos,0.0,1.0);}";

/** One full-screen triangle. */
export const TRIANGLE = [-1, -1, 3, -1, -1, 3] as const;

// u_view = res.xy device px · dpr · time s (wrapped at 600) · u_ink = ink rgb · alpha cap · u_seed.x = seed 0..1.
// vnoise is 32-cell periodic and the air drifts 32 cells per 600 s (0.053333333 = 32 / 600), so the wrap is seamless.
export const PRELUDE = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform vec4 u_view;
uniform vec4 u_ink;
uniform vec4 u_seed;
#define RES u_view.xy
#define DPR u_view.z
#define TIME u_view.w
#define CAP u_ink.a
#define SEED u_seed.x
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);vec2 a=mod(i,32.0),b=mod(i+1.0,32.0);
return mix(mix(h21(a),h21(vec2(b.x,a.y)),u.x),mix(h21(vec2(a.x,b.y)),h21(b),u.x),u.y);}
float band(float d,float hw){return clamp(hw-abs(d)+0.5,0.0,1.0);}
float dither(vec2 px){return (h21(mod(px,256.0)+SEED)-0.5)/255.0;}
vec4 premul(vec3 c,float a){a=clamp(a,0.0,1.0);return vec4(c*a,a);}
`;

// u_dawn = (aimX, horizonY, air, dim): the aim point on the hairline in device px (GL y up),
// the CPU air ramp 0 → 1 → 0, and 1 (only static slots are dimmed, and they have no canvas).
export const HORIZON = `uniform vec4 u_dawn;
void main(){
vec2 px=v_uv*RES;float H=u_dawn.y;
vec2 e=(px-vec2(u_dawn.x,H))/vec2(0.62*RES.x,1.15*(RES.y-H)+1.0);
float dawn=exp(-dot(e,e)*2.2)*smoothstep(H-1.0,H+1.0,px.y);
vec2 g=px/(38.0*DPR);float drift=TIME*0.053333333;
float n=0.5*(vnoise(g+SEED*97.0+vec2(drift,0.0))+vnoise(g*1.7-SEED*53.0-vec2(drift,0.0)))-0.5;
dawn*=1.0+u_dawn.z*n*0.4;
gl_FragColor=premul(u_ink.rgb,dawn*CAP*u_dawn.w+dither(px));
}`;

export const WEAVE = `void main(){vec2 px=v_uv*RES;float cy=RES.y*0.5,a=0.0,br=6.2831853*TIME/12.0;
for(int i=0;i<4;i++){float fi=float(i),k=6.2831853/(RES.x*(0.55+0.15*fi));
float amp=RES.y*(0.16+0.05*fi)*cos(br+fi*1.5708);
float ph=px.x*k+fi*1.7,sl=amp*k*cos(ph);
float d=(px.y-cy-amp*sin(ph))/sqrt(1.0+sl*sl);
float lift=step(0.5,fract(px.x/(RES.x*0.25)+fi*0.5));
a=max(a,band(d,0.7*DPR)*mix(0.5,0.85,lift));}
float edge=smoothstep(0.0,0.08,v_uv.x)*(1.0-smoothstep(0.92,1.0,v_uv.x));
gl_FragColor=premul(u_ink.rgb,a*edge*CAP);}`;

/** Everything a frame's uniforms are made of. Nothing in it is a measured value. */
export interface UniformFrame {
  /** Canvas size in device px. */
  w: number;
  h: number;
  dpr: number;
  /** Seconds, wrapped at 600. */
  time: number;
  ink: Rgb;
  cap: number;
  seed: number;
  /** The horizon's air ramp, 0..1. */
  air: number;
}

export type Vec4 = [number, number, number, number];

const shared = (f: UniformFrame): Record<string, Vec4> => ({
  u_view: [f.w, f.h, f.dpr, f.time],
  u_ink: [f.ink[0], f.ink[1], f.ink[2], f.cap],
  u_seed: [f.seed, 0, 0, 0],
});

export const BINDERS: Record<ShaderProgram, (f: UniformFrame) => Record<string, Vec4>> = {
  horizon: (f) => ({ ...shared(f), u_dawn: [0.93 * f.w, 0.62 * f.h, f.air, 1] }),
  weave: shared,
};

export interface ProgramDef {
  id: ShaderProgram;
  frag: string;
  uniforms: (f: UniformFrame) => Record<string, Vec4>;
  licence: "ambient" | "wait";
  fps: number;
  dprCap: number;
  maxDevicePx: readonly [number, number];
}

export const PROGRAMS: Record<ShaderProgram, ProgramDef> = {
  horizon: { id: "horizon", frag: PRELUDE + HORIZON, uniforms: BINDERS.horizon, licence: LIMITS.horizon.licence, fps: LIMITS.horizon.fps, dprCap: LIMITS.horizon.dprCap, maxDevicePx: LIMITS.horizon.maxPx },
  weave: { id: "weave", frag: PRELUDE + WEAVE, uniforms: BINDERS.weave, licence: LIMITS.weave.licence, fps: LIMITS.weave.fps, dprCap: LIMITS.weave.dprCap, maxDevicePx: LIMITS.weave.maxPx },
};
