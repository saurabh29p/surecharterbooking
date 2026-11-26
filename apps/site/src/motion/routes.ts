/**
 * The home page's routes, in the order the destination cards list them (each destination's two card
 * times), with the stretch of the destinations chapter over which each contrail draws. Shared by the
 * map scene (three/scenes/map.ts) and the route list beside it (motion/chapters/dest.ts).
 */
export const HOME_ROUTES: { from: string; to: string; at: [number, number] }[] = [
  { from: 'delhi', to: 'udaipur', at: [0.06, 0.2] },
  { from: 'mumbai', to: 'udaipur', at: [0.12, 0.26] },
  { from: 'delhi', to: 'jaipur', at: [0.36, 0.48] },
  { from: 'kolkata', to: 'jaipur', at: [0.4, 0.56] },
  { from: 'bengaluru', to: 'goa', at: [0.66, 0.78] },
  { from: 'delhi', to: 'goa', at: [0.7, 0.86] },
];
