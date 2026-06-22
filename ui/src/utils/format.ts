export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatRTT = (rtt: string): string => {
  if (!rtt) return '-';
  // Match something like 1.430292ms or 500µs
  const match = rtt.match(/^(\d+\.?\d*)([a-zµ]+)$/);
  if (!match) return rtt;
  const [_, value, unit] = match;
  const num = parseFloat(value);
  if (unit === 'ms') {
    return num < 1 ? rtt : `${num.toFixed(1)}ms`;
  }
  if (unit === 's') {
    return `${num.toFixed(2)}s`;
  }
  return rtt;
};

export const formatNumber = (num: number): string => {
  if (num === undefined || num === null || isNaN(num)) return '-';
  if (num < 1000) return num.toString();
  if (num < 1000000) {
    const k = num / 1000;
    return k.toFixed(1).replace(/\.0$/, '') + 'k';
  }
  if (num < 1000000000) {
    const m = num / 1000000;
    return m.toFixed(1).replace(/\.0$/, '') + 'M';
  }
  const b = num / 1000000000;
  return b.toFixed(1).replace(/\.0$/, '') + 'B';
};
