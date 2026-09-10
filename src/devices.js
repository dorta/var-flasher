const { execFile } = require('node:child_process');
const formatSize = (bytes) => { if (!bytes) return '0 B'; const units=['B','KB','MB','GB','TB']; let n=bytes,i=0; while(n>=1024&&i<units.length-1){n/=1024;i++} return `${n>=10||i===0?Math.round(n):n.toFixed(1)} ${units[i]}`; };

function listDevices() {
  return new Promise((resolve, reject) => {
    execFile('lsblk', ['-b', '-J', '-o', 'NAME,PATH,TYPE,RM,RO,SIZE,MODEL,TRAN,MAJ:MIN,SERIAL,WWN,MOUNTPOINTS'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      let data;
      try { data = JSON.parse(stdout); } catch (parseError) { return reject(parseError); }
      const collectMountpoints = (node) => [
        ...(node.mountpoints || []).filter(Boolean),
        ...(node.children || []).flatMap(collectMountpoints),
      ];
      const devices = (data.blockdevices || []).filter((d) => d.type === 'disk').map((d) => ({
        name: d.name,
        path: d.path || '/dev/' + d.name,
        sizeBytes: Number(d.size || 0),
        size: formatSize(Number(d.size || 0)),
        model: (d.model || 'Unknown device').trim(),
        transport: d.tran || 'unknown',
        majorMinor: d['maj:min'] || null,
        serial: (d.serial || '').trim() || null,
        wwn: (d.wwn || '').trim() || null,
        removable: d.rm === true || d.rm === '1',
        readOnly: d.ro === true || d.ro === '1',
        mountpoints: [...new Set(collectMountpoints(d))],
      })).filter((d) => d.removable && !d.readOnly && Number(d.sizeBytes) > 0);
      resolve(devices);
    });
  });
}

module.exports = { listDevices };
