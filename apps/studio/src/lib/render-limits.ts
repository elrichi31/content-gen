export function parseActiveRenderJobLimit(value = process.env.MAX_ACTIVE_RENDER_JOBS) {
  const limit = Number(value ?? 2);
  return Number.isInteger(limit) && limit >= 1 && limit <= 10 ? limit : 2;
}
