const radios = document.querySelectorAll('input[name="expandMode"]');
const saved = document.getElementById('saved');

chrome.storage.sync.get({ expandMode: 'collapsed' }, ({ expandMode }) => {
  for (const r of radios) r.checked = r.value === expandMode;
});

for (const r of radios) {
  r.addEventListener('change', () => {
    chrome.storage.sync.set({ expandMode: r.value }, () => {
      saved.textContent = 'Salvo — vale para as abas abertas também.';
    });
  });
}
