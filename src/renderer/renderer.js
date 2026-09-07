const state = { releases: [], selectedRelease: null, selectedDevice: null };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function fillFilters() {
  const soms = [...new Set(state.releases.flatMap((r) => r.soms))].sort();
  const oses = [...new Set(state.releases.map((r) => r.os))].sort();
  $('som').innerHTML = '<option value="">All SOMs</option>' + soms.map((x) => '<option>'+escapeHtml(x)+'</option>').join('');
  $('os').innerHTML = '<option value="">All OSes</option>' + oses.map((x) => '<option>'+escapeHtml(x)+'</option>').join('');
}
function renderReleases() {
  const query = $('search').value.toLowerCase();
  const som = $('som').value, os = $('os').value;
  const items = state.releases.filter((r) => (!som || r.soms.includes(som)) && (!os || r.os === os) && (!query || JSON.stringify(r).toLowerCase().includes(query)));
  $('catalogStatus').textContent = items.length + ' releases found';
  $('releases').innerHTML = items.map((r, i) => '<button class="release '+(state.selectedRelease === r ? 'selected' : '')+'" data-index="'+state.releases.indexOf(r)+'"><div><strong>'+escapeHtml(r.soms.join(' · '))+'</strong><span>'+escapeHtml(r.os)+'</span></div><div class="release-meta"><span>'+escapeHtml(r.tag)+'</span><time>'+escapeHtml(r.date)+'</time></div></button>').join('');
  document.querySelectorAll('.release').forEach((button) => button.onclick = async () => { state.selectedRelease = state.releases[button.dataset.index]; renderReleases(); $('selectionStatus').textContent = 'Loading image details...'; const page = state.selectedRelease.pages[0]; try { state.selectedRelease.details = await window.varFlasher.getRelease(page.url); $('selectionStatus').textContent = state.selectedRelease.details.imageUrl ? 'Image link found. Select an SD card.' : 'Release page has no image link.'; } catch (e) { $('selectionStatus').textContent = e.message; } updateWrite(); });
}
async function loadDevices() { $('deviceStatus').textContent = 'Scanning removable devices...'; try { const devices = await window.varFlasher.getDevices(); $('devices').innerHTML = devices.length ? devices.map((d, i) => '<button class="device '+(state.selectedDevice === d ? 'selected' : '')+'" data-index="'+i+'"><strong>'+escapeHtml(d.path)+'</strong><span>'+escapeHtml(d.model)+' · '+escapeHtml(d.size)+' · '+escapeHtml(d.transport)+'</span></button>').join('') : '<p class="empty">No removable devices detected.</p>'; document.querySelectorAll('.device').forEach((b) => b.onclick = () => { state.selectedDevice = devices[b.dataset.index]; loadDevices(); updateWrite(); }); $('deviceStatus').textContent = devices.length + ' removable device(s) found'; } catch (e) { $('deviceStatus').textContent = e.message; } }
function updateWrite() { const ready = state.selectedRelease?.details?.imageUrl && state.selectedDevice; $('write').disabled = !ready; $('selectionTitle').textContent = state.selectedRelease ? state.selectedRelease.tag : 'Ready to write'; if (state.selectedDevice) $('selectionStatus').textContent = 'Target: '+state.selectedDevice.path+'. Writing will erase it.'; }
async function loadCatalog() { $('catalogStatus').textContent = 'Loading releases from dev.variscite.com...'; try { state.releases = await window.varFlasher.getCatalog(); fillFilters(); renderReleases(); } catch (e) { $('catalogStatus').textContent = 'Catalog error: '+e.message; } }
$('search').oninput = renderReleases; $('som').onchange = renderReleases; $('os').onchange = renderReleases; $('refreshCatalog').onclick = loadCatalog; $('refreshDevices').onclick = loadDevices; $('write').onclick = () => alert('Writing backend will be enabled after the image download and safety confirmation flow is connected.');
loadCatalog(); loadDevices();
