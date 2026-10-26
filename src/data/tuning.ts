// Every gameplay constant, each citing its source note in research/mechanics/ (measured) or
// marked "invented". Distances in H, times in seconds.

export const TUNING = {
  /** Fixed simulation rate. */
  simHz: 60,
  /** Key poses sit on a 30 fps grid: the episodes animate on every frame at 30 fps (research/README.md). */
  animKeyHz: 30,
} as const;
