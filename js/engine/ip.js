// ip.js — small IPv4 helpers used by the engine and the tests. No DOM.

/** "192.168.1.10" -> 3232235786 (unsigned 32-bit number). */
export function ipToInt(ip) {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** 24 -> 0xFFFFFF00 (as an unsigned number). */
export function maskFromPrefix(prefix) {
  return prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
}

/** Network address of ip/prefix, as a number. */
export function networkOf(ip, prefix) {
  return (ipToInt(ip) & maskFromPrefix(prefix)) >>> 0;
}

/** True when ip is inside network/prefix. */
export function inSubnet(ip, network, prefix) {
  return networkOf(ip, prefix) === networkOf(network, prefix);
}
