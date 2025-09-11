/* Minimal OE client stub used for builds */
export async function getOeSchedule(vin, _opts = {}) { return stubOe(vin); }
export async function fetchOeSchedule(vin, opts) { return getOeSchedule(vin, opts); }
export function stubOe(vin) {
  return { stub: true, vin, maintenance: [] };
}
const oeClient = { getOeSchedule, fetchOeSchedule, stubOe };
export default oeClient;
