/* Original read-only adapter. No GeoGuessr or Learnable Meta source copied. */
(function (root) {
  const validId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
  function normalizeCoordinate(value) {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)
      || value.lat < -90 || value.lat > 90 || value.lng < -180 || value.lng > 180
      || typeof value.panoId !== 'string' || !value.panoId.trim()) return null;
    return { lat: value.lat, lng: value.lng, panoId: value.panoId, heading: Number.isFinite(value.heading) ? value.heading : 0 };
  }
  function uniqueCoordinates(values) {
    if (!Array.isArray(values)) throw new Error('This draft contains no coordinate array.');
    const seen = new Set();
    return values.map(normalizeCoordinate).filter(value => value && !seen.has(value.panoId) && seen.add(value.panoId));
  }
  async function exportTaggedPool({ mapId, title, coordinates, getMeta, onProgress = () => {}, cancelled = () => false }) {
    if (!validId(mapId)) throw new Error('A valid GeoGuessr map ID is required.');
    const candidates = uniqueCoordinates(coordinates);
    const skills = new Map();
    const locations = [];
    const unmatched = [];
    const failures = [];
    // Deliberately sequential: respect the source service and allow cancellation.
    for (let index = 0; index < candidates.length; index++) {
      if (cancelled()) break;
      const coordinate = candidates[index];
      try {
        const meta = await getMeta(coordinate.panoId);
        if (!meta || typeof meta.metaName !== 'string' || !meta.metaName.trim()) unmatched.push(coordinate.panoId);
        else {
          const name = meta.metaName.trim();
          const id = `${mapId}:${name}`;
          if (!skills.has(id)) skills.set(id, { id, title: name, phase: 'Imported clues', prerequisites: [],
            imageUrls: Array.isArray(meta.images) ? meta.images.filter(url => typeof url === 'string' && url.startsWith('https://')) : [],
            source: { title: 'Learnable Meta', url: `https://learnablemeta.com/maps/${mapId}` },
            sourceNoteHtml: typeof meta.note === 'string' ? meta.note : '',
            attributionHtml: typeof meta.footer === 'string' ? meta.footer : '',
          });
          locations.push({ id: `pano:${coordinate.panoId}`, ...coordinate, skillIds: [id], sourceMapId: mapId });
        }
      } catch (error) { failures.push({ panoId: coordinate.panoId, error: String(error.message || error).slice(0,200) }); }
      onProgress(index + 1, candidates.length);
    }
    return {
      id: `lm-${mapId}`, title: title || 'Imported practice pool', subject: 'GeoGuessr',
      skills: [...skills.values()],
      pools: [{ id: mapId, title: title || 'Imported practice pool', skillIds: [...skills.keys()], mapUrl: `https://www.geoguessr.com/maps/${mapId}`, locationIds: locations.map(value => value.id) }],
      locations,
      importReport: { candidates: candidates.length, tagged: locations.length, unmatched, failures, cancelled: cancelled(),
        limits: 'The public endpoint returns one note per panorama. This export does not establish complete multi-clue annotation or an unseen holdout set.' },
    };
  }
  root.FieldworkSourceBridge = { validId, normalizeCoordinate, uniqueCoordinates, exportTaggedPool };
})(typeof globalThis !== 'undefined' ? globalThis : this);
