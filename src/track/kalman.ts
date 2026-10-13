/**
 * Constant-velocity Kalman filter + Rauch–Tung–Striebel smoother, run independently on the
 * east and north axes (local metres). Forward-backward smoothing removes GPS jitter without the
 * lag a one-sided filter would add.
 */
export interface KalmanOptions {
  /** GPS position noise, metres (1σ) */
  measurementSigma: number;
  /** process noise: acceleration spectral density (m²/s³); smaller = smoother */
  processNoise: number;
}

export function rtsSmooth1D(z: number[], dts: number[], opts: KalmanOptions): number[] {
  const n = z.length;
  if (n < 3) return z.slice();
  const R = opts.measurementSigma ** 2;
  const q = opts.processNoise;

  // Filtered state/covariance and predicted state/covariance per step. P = [a b; b d].
  const xf = new Float64Array(n * 2);
  const Pf = new Float64Array(n * 3);
  const xp = new Float64Array(n * 2);
  const Pp = new Float64Array(n * 3);

  let x0 = z[0];
  let v0 = 0;
  let a = R;
  let b = 0;
  let d = 25; // velocity variance (5 m/s)²

  for (let k = 0; k < n; k++) {
    if (k > 0) {
      const dt = dts[k];
      // predict: F = [1 dt; 0 1]
      const px = x0 + dt * v0;
      const pv = v0;
      const pa = a + 2 * dt * b + dt * dt * d + (q * dt ** 3) / 3;
      const pb = b + dt * d + (q * dt ** 2) / 2;
      const pd = d + q * dt;
      x0 = px;
      v0 = pv;
      a = pa;
      b = pb;
      d = pd;
    }
    xp[2 * k] = x0;
    xp[2 * k + 1] = v0;
    Pp[3 * k] = a;
    Pp[3 * k + 1] = b;
    Pp[3 * k + 2] = d;

    // update with H = [1 0]
    const S = a + R;
    const K0 = a / S;
    const K1 = b / S;
    const y = z[k] - x0;
    x0 += K0 * y;
    v0 += K1 * y;
    const na = (1 - K0) * a;
    const nb = (1 - K0) * b;
    const nd = d - K1 * b;
    a = na;
    b = nb;
    d = nd;

    xf[2 * k] = x0;
    xf[2 * k + 1] = v0;
    Pf[3 * k] = a;
    Pf[3 * k + 1] = b;
    Pf[3 * k + 2] = d;
  }

  // backward pass
  const out = new Array<number>(n);
  let sx = xf[2 * (n - 1)];
  let sv = xf[2 * (n - 1) + 1];
  out[n - 1] = sx;
  for (let k = n - 2; k >= 0; k--) {
    const dt = dts[k + 1];
    const fa = Pf[3 * k];
    const fb = Pf[3 * k + 1];
    const fd = Pf[3 * k + 2];
    // P_f F^T = [fa + dt fb, fb; fb + dt fd, fd]
    const m00 = fa + dt * fb;
    const m01 = fb;
    const m10 = fb + dt * fd;
    const m11 = fd;
    // inverse of predicted covariance at k+1
    const pa = Pp[3 * (k + 1)];
    const pb = Pp[3 * (k + 1) + 1];
    const pd = Pp[3 * (k + 1) + 2];
    const det = pa * pd - pb * pb || 1e-12;
    const i00 = pd / det;
    const i01 = -pb / det;
    const i11 = pa / det;
    // C = M * inv(Pp)
    const c00 = m00 * i00 + m01 * i01;
    const c01 = m00 * i01 + m01 * i11;
    const c10 = m10 * i00 + m11 * i01;
    const c11 = m10 * i01 + m11 * i11;
    const ex = sx - xp[2 * (k + 1)];
    const ev = sv - xp[2 * (k + 1) + 1];
    sx = xf[2 * k] + c00 * ex + c01 * ev;
    sv = xf[2 * k + 1] + c10 * ex + c11 * ev;
    out[k] = sx;
  }
  return out;
}

/** Map a 0..1 UI "smoothing strength" to filter parameters. */
export function kalmanOptionsForStrength(strength: number): KalmanOptions {
  const s = Math.max(0, Math.min(1, strength));
  return { measurementSigma: 4 + 6 * s, processNoise: 10 ** (0.5 - 3 * s) };
}
