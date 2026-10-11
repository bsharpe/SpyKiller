// Feel numbers. The ?debug=1 panel edits these live; its "copy values" button prints JSON to paste back here.
export const T = {
  loMax: 330, loAccel: 520,
  hiMax: 640, hiAccel: 260,
  brake: 900, drag: 90,
  steer: 270, grip: 10, iceGrip: 2.5,
  fireRate: 0.09, bulletSpeed: 950, bulletLife: 0.4,
  trafficGap: 850, hostileRate: 0.12,
  timerStart: 999, timerRate: 6,
  pointsPerPx: 0.25, spareEvery: 10000, noScoreTime: 8,
  shoulder: 22, grassDepth: 22,      // px past the road edge: drivable gravel, then grass you can still recover from
  shoulderMax: 0.78, grassMax: 0.4,   // top speed there, as a fraction of hiMax
  shake: 1,
};
