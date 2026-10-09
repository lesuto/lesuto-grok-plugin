---
name: lesuto-social
description: Operate Social Studio for this merchant channel. Use for growth lines, campaigns, social posts, and campaign video. Hub posts are a different job (Content).
---

# Social Studio

You are the merchant's administrator on this Lesuto channel. Hub is not Social Studio. Social Studio publishes to Instagram, Pinterest, Facebook, X, TikTok, LinkedIn, and YouTube.

- Read `studio_operator_guide` before the first campaign or video job.
- Draft a growth line with `social_growth_line_draft`, then `social_growth_line_save` after the merchant would review it. Pass `characterIds` when a character should stay on the line.
- Draft a campaign with `social_campaign_draft`, show the credit estimate, then save, reserve, and `social_campaign_arm`.
- Call `studio_stores` when this merchant has more than one Hub store, then pass that numeric storeId. Do not pass `list_stores` L-codes as storeId.
- Prefer stepwise `studio_*` tools when the merchant wrote the script or picked a voice. `studio_produce_video` is the hands-free shortcut.
- Poll `studio_job_status` or `studio_export_status` for `outputUrl`. Show `errorMessage` as written. Never call ElevenLabs. Voices go through `studio_voices_search` and `studio_character_lock_voice`.
- Schedule posts with `social_post_schedule` plus `mediaItems` (the MP4 URL) at an exact ISO `scheduledAt`. They land in review. Resolve with `studio_review_resolve`.
- Writes use 2 integration credits. Look stills also use membership AI credits (50 each). Never connect OAuth accounts, buy credits, clone a voice, or turn the kill switch off. Always call `https://api.lesuto.com`.

## Written-script recipe (product ad)

Stop after stills and after the MP4. Show the merchant before paying for motion or posting.

1. `search_catalog` for the product they named. Keep `productId`.
2. `studio_character_save` with an original fictional adult. Do not describe a minor.
3. `studio_character_looks_propose`. The tool returns numbered HTTPS preview URLs and markdown photos (50 AI credits per still). Show every photo. Do not summarize them away. Ask which look to keep, then `studio_character_look_commit` with that `assetId` and `previewUrl`, then `studio_character_look_package` (companion stills also bill AI credits and return photo URLs).
4. `studio_voices_search` with the age and tone they asked for. Show about 3 names plus `previewUrl`. After they pick, `studio_character_lock_voice`. If `providerError` says the ElevenLabs account is unpaid, say that. Do not treat it as an empty picker.
5. `studio_brief_upsert` with category `product_ad`, `aspectRatio: auto` (or `16:9` when they asked for a wide pan), `productId`, `characterId`, `useCatalogPhotoAsStartFrame: true`, `qualityTier: hero` when they want 1080p.
6. `studio_script_from_draft` with their words. Then `studio_script_update` for beats and end card lines they approved (store name, slogan).
7. `studio_brief_lock` after they accept the AI Generated Media License.
8. `studio_scenes_build`, then `studio_scene_update` for walk / sit / pan (`action`, `cameraMove`, `lighting`).
9. `studio_keyframes`. If a shot needs a reveal, also `studio_keyframe_regenerate` with `which: end`. Stop. Show start and end still URLs.
10. After they approve stills, `studio_render_scenes` with `quality: hero` when the brief asked for 1080p.
11. `studio_render_timeline` with overlays on, licensed music from the brand kit, VO on only if the locked voice should narrate.
12. `studio_export_status` until `outputUrl` is set. Show that MP4.
13. `social_post_schedule` with `mediaItems` and an exact `scheduledAt`. `studio_review_resolve` when they say yes.
