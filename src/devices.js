const { execFile } = require('node:child_process');

function listDevices() {
  return new Promise((resolve, reject) => {
    execFile('lsblk', ['-J', '-o', 'NAME,PATH,TYPE,RM,RO,SIZE,MODEL,TRAN,MOUNTPOINTS'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      let data;
      try { data = JSON.parse(stdout); } catch (parseError) { return reject(parseError); }
      const devices = (data.blockdevices || []).filter((d) => d.type === 'disk').map((d) => ({
        name: d.name,
        path: d.path || '/dev/' + d.name,
        size: d.size || 'unknown',
        model: (d.model || 'Unknown device').trim(),
        transport: d.tran || 'unknown',
        removable: d.rm === true || d.rm === '1' || d.tran === 'usb' || d.tran === 'mmc',
        readOnly: d.ro === true || d.ro === '1',
        mountpoints: (d.mountpoints || []).filter(Boolean),
      })).filter((d) => d.removable && !d.readOnly);
      resolve(devices);
    });
  });
}

module.exports = { listDevices };
