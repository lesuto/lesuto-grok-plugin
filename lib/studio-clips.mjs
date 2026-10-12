export function orderScenesForStitch(scenes, sceneIds) {
  const rendered = (Array.isArray(scenes) ? scenes : []).filter((s) => s?.renderedAssetId);
  if (!rendered.length) {
    throw new Error('Render scenes before stitching. Ready clips only. Call studio_render_scenes per sceneId.');
  }
  const wanted = (Array.isArray(sceneIds) ? sceneIds : []).map((id) => String(id)).filter(Boolean);
  if (!wanted.length) return clipRows(rendered);
  const ordered = wanted.map((id) => {
    const scene = rendered.find((s) => String(s.id) === id);
    if (!scene) throw new Error(`Scene ${id} has no rendered clip yet.`);
    return scene;
  });
  const seen = new Set(ordered.map((s) => String(s.id)));
  const rest = rendered.filter((s) => !seen.has(String(s.id)));
  return clipRows([...ordered, ...rest]);
}

function clipRows(rows) {
  return rows.map((scene, orderIndex) => {
    const dur = Math.max(0.5, Number(scene.durationSeconds) || 6);
    return {
      sceneId: Number(scene.id),
      inSec: 0,
      outSec: dur,
      orderIndex,
      assetId: Number(scene.renderedAssetId),
    };
  });
}
