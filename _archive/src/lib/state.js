// src/lib/state.js
// Simple in-memory store for MVP (resets on server restart)
export const state = {
  carfax: { points: [] },     // [{ date: "YYYY-MM-DD", odo: 12345 }]
  dvi:    { vin: "", mileage: 0, findings: [] }
};

export function setCarfaxPoints(points) {
  state.carfax.points = points;
}
export function getCarfaxPoints() {
  return state.carfax.points || [];
}

export function setDvi(payload) {
  state.dvi = payload || { vin: "", mileage: 0, findings: [] };
}
export function getDvi() {
  return state.dvi || { vin: "", mileage: 0, findings: [] };
}
