import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function privateIPv4(value) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return false;
  const octets = value.split('.').map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}
export function physicalAddresses(interfaces) {
  return interfaces.filter((item) => /^(?:en|eth|wl)/.test(item.ifname)).map((item) => ({
    interface: item.ifname, state: item.operstate,
    ipv4: (item.addr_info || []).filter((address) => address.family === 'inet' && privateIPv4(address.local)).map((address) => address.local),
  }));
}
function command(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: 6000, stdio: ['ignore', 'pipe', 'ignore'] });
  return { ok: result.status === 0, output: result.stdout?.trim() || '' };
}
function jsonCommand(binary, args) {
  try { return JSON.parse(command(binary, args).output); } catch { return []; }
}
function diagnose(client) {
  if (!privateIPv4(client)) throw new Error('Client must be a private IPv4 address');
  const interfaces = physicalAddresses(jsonCommand('ip', ['-j', 'addr', 'show']));
  const route = jsonCommand('ip', ['-j', 'route', 'get', client])[0];
  const defaults = jsonCommand('ip', ['-j', 'route', 'show', 'default']);
  const gateway = defaults.find((entry) => interfaces.some((item) => item.interface === entry.dev) && privateIPv4(entry.gateway))?.gateway;
  const ping = (address) => command('ping', ['-n', '-c', '2', '-W', '1', address]).ok;
  const clientReachable = ping(client);
  const neighbors = jsonCommand('ip', ['-j', 'neigh', 'show', 'to', client]);
  const ssh = command('systemctl', ['is-active', 'ssh']);
  const listeners = command('ss', ['-H', '-ltn', 'sport = :22']);
  const containers = command('docker', ['ps', '--format', '{{.Names}} {{.Status}}']);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(Number(readFileSync('/proc/uptime', 'utf8').split(' ')[0])),
    ssh: { active: ssh.ok, status: ssh.output, listening: Boolean(listeners.output), listensBeyondLoopback: listeners.output.split('\n').some((line) => /(?:0\.0\.0\.0|\[::\]|\*):22/.test(line)) },
    interfaces,
    clientRoute: route ? { interface: route.dev, source: privateIPv4(route.prefsrc) ? route.prefsrc : undefined } : null,
    clientReachable,
    clientNeighborStates: neighbors.map((entry) => ({ interface: entry.dev, state: entry.state })),
    gatewayReachable: gateway ? ping(gateway) : null,
    networkManagerActive: command('systemctl', ['is-active', 'NetworkManager']).ok,
    powerStatus: command('vcgencmd', ['get_throttled']).output || 'unavailable',
    platformContainers: containers.output.split('\n').filter((line) => /^(?:botcrm-|bot-platform-|vk-content-bot-|telegram-service-bot-)/.test(line)),
  }, null, 2));
  // No environment variables, credentials, MACs, public addresses or raw journals.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { diagnose(process.env.DIAGNOSTIC_CLIENT_IPV4 || '192.168.31.196'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
