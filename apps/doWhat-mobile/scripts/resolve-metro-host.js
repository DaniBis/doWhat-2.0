#!/usr/bin/env node
const os = require('os');

const explicitHost = (process.env.EXPO_DEV_SERVER_HOST || '').trim();
if (explicitHost) {
  process.stdout.write(explicitHost);
  process.exit(0);
}

const normalizeInterfaces = (value = '') =>
  value
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

const preferredNames = normalizeInterfaces(process.env.EXPO_LAN_INTERFACES || 'en0,en1,eth0,wlan0');
const interfaces = os.networkInterfaces();

const collectAddresses = (names, weightBase = 0) => {
  const results = [];
  names.forEach((name, index) => {
    const entries = interfaces[name];
    if (!entries) return;
    entries.forEach((entry) => {
      if (entry.family !== 'IPv4' || entry.internal) return;
      results.push({ address: entry.address, weight: weightBase + index });
    });
  });
  return results;
};

const preferred = collectAddresses(preferredNames);

const remainingInterfaceNames = Object.keys(interfaces).filter((name) => !preferredNames.includes(name));
const remaining = collectAddresses(remainingInterfaceNames, preferredNames.length + 1);

const combined = [...preferred, ...remaining];
combined.sort((a, b) => a.weight - b.weight);

const host = combined[0]?.address || '127.0.0.1';
process.stdout.write(host);
