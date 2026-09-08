const { execFile } = require('node:child_process');

function listDevices() {
  return new Promise((resolve, reject) => {
    execFile('lsblk', ['-J', '-o', 'NAME,PATH,TYPE,RM,RO,SIZE,MODEL,TRAN,MAJ:MIN,SERIAL,MOUNTPOINTS'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr.trim() || error.message));
      let data;
      try { data = JSON.parse(stdout); } catch (parseError) { return reject(parseError); }
      const devices = (data.blockdevices || []).filter((d) => d.type === 'disk').map((d) => ({
        name: d.name,
        path: d.path || '/dev/' + d.name,
        size: d.size || 'unknown',
        model: (d.model || 'Unknown device').trim(),
        transport: d.tran || 'unknown',
        majorMinor: d['maj:min'] || null,
        serial: (d.serial || '').trim() || null,
        removable: d.rm === true || d.rm === '1',
        readOnly: d.ro === true || d.ro === '1',
        mountpoints: (d.mountpoints || []).filter(Boolean),
      })).filter((d) => d.removable && !d.readOnly && !/^0+(?:B)?$/i.test(String(d.size).replace(/\s/g, '')) && String(d.size).toUpperCase() !== '0B');
      resolve(devices);
    });
  });
}

module.exports = { listDevices };
