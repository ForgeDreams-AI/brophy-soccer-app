# PDF Hosting — Drill PDF Import

## Decision: Firebase Storage (NOT Google Drive)

The Drive folder "Practice plans" (`1EbC7PicdvozovaPsARVKNg0D4jfrPc69`) is shared with **8 named users only** — its permission list has no `type: "anyone"` entry, and a spot-checked file (`Preseason session #1.pdf`) has the same 8 user-only permissions. A Drive `webViewLink` would fail to open for most players and coaches. The drill library is shared across all three teams, so the PDFs must live where any signed-in team member can read them: **Firebase Storage**.

## Visibility proof (all three levels see the drills)

- `teamhub/firestore.rules` line 170–171: `match /drillLibrary/{drillId} { allow read: if true; ... }` — public read.
- `teamhub/src/TeamHubRoles.jsx` line 8799: `useCollection("drillLibrary", orderBy("createdAt", "desc"))` — **no team filter, no `where` clause**. The team app reads the one shared collection for JVB, JVA, and Varsity alike.
- One drill doc each, never three per-team copies. The PDFs are read-gated to any signed-in user via the Storage rule below (stricter than the drill docs themselves, which are public-read — consistent with how drill photos/diagrams already work).

## Storage rules (committed, NOT deployed)

Commit `f310946` on `main` — `teamhub/storage.rules` only (+12 lines), pushed. The parent deploys it (e.g. `firebase deploy --only storage --project brophy-soccer-app` from `teamhub/` in Cloud Shell as Logan) before/with the upload.

New block, placed right after the existing `drills/{uid}/{filename}` block (same pattern, PDF instead of image, 50MB instead of 10MB):

```js
// Session PDFs (Practice Plans). Path shape: drillPdfs/{uid}/{filename}.
// The drill library is shared across all three Brophy teams, so any
// signed-in team member can read; only the uploader writes to their
// own folder, must be a PDF, max 50MB.
match /drillPdfs/{uid}/{filename} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.auth.uid == uid
    && request.resource.size < 50 * 1024 * 1024
    && request.resource.contentType.matches('application/pdf');
}
```

## Staged upload list (34 files — the 1 exact dupe excluded)

`staging-upload-list.json` in this folder: one entry per unique PDF with `local_file` (`pdfs/<name>`), `drive_id`, `drive_name`, `size`, and `target_storage_path` = `drillPdfs/<UPLOADER_UID>/<local-filename>`.

**`<UPLOADER_UID>` must be substituted at upload time** with the Firebase uid of the uploader (the upload runs in Cloud Shell as Logan with a service-account key, which bypasses rules — any consistent uid segment works; use the uploader's real uid so future client-side uploads under the rule also land in the same folder). Total staged size: ~7.9 MB across 34 files (largest 324,761 bytes).

The duplicate `Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd 2.pdf` is NOT staged — its content is byte-identical to the original and its drills are covered by the original's whole-session drill.

## URL that goes in each whole-session drill

Each whole-session drill in `drills.json` currently has `info: "Source: <Drive filename>"` only. After upload, the parent import script must append the PDF link to that `info` field:

```
Source: <Drive filename>
PDF: <download URL>
```

**Download URL pattern** (bucket `brophy-soccer-app.firebasestorage.app`):

```
https://firebasestorage.googleapis.com/v0/b/brophy-soccer-app.firebasestorage.app/o/drillPdfs%2F<UPLOADER_UID>%2F<local-filename>?alt=media&token=<TOKEN>
```

**The `<TOKEN>` does not exist yet — it is minted at upload.** The standard way: when uploading with the Admin SDK, set each file's metadata `firebaseStorageDownloadTokens` to a fresh UUID (one per file), and the URL above with that UUID as the token is the permanent download link. (Equivalently, `getDownloadURL()` after upload returns the same URL.) The parent script must capture each file's token at upload time, build the URL, and append it to the matching whole-session drill's `info` (match by the `Source:` filename) before running the admin `addDoc` import.

Per-file target paths (from `staging-upload-list.json`):

| Local file | Target Storage path |
|---|---|
| Week_5__Session__17_high_press_organization_off_of_opponent_s_goal_kicks.pdf | drillPdfs/<UPLOADER_UID>/Week_5__Session__17_high_press_organization_off_of_opponent_s_goal_kicks.pdf |
| Week_7__Session__24___transition_D__A_from_the_midfield_third.pdf | drillPdfs/<UPLOADER_UID>/Week_7__Session__24___transition_D__A_from_the_midfield_third.pdf |
| Week_2__session__5_continue_to_build_fitness_base__while_doing_individual_and_small_group_activities.pdf | drillPdfs/<UPLOADER_UID>/Week_2__session__5_continue_to_build_fitness_base__while_doing_individual_and_small_group_activities.pdf |
| Week_6__Session__21___4v4___3_and_6v6_tournament_to_big_goals.pdf | drillPdfs/<UPLOADER_UID>/Week_6__Session__21___4v4___3_and_6v6_tournament_to_big_goals.pdf |
| Preseason_session_2_Passing_patterns_3rd_man_runs_building_a_fitness_base_and_feel_for_playing.pdf | drillPdfs/<UPLOADER_UID>/Preseason_session_2_Passing_patterns_3rd_man_runs_building_a_fitness_base_and_feel_for_playing.pdf |
| Week_4__Session__14_Counter_pressing_in_the_middle_third.pdf | drillPdfs/<UPLOADER_UID>/Week_4__Session__14_Counter_pressing_in_the_middle_third.pdf |
| Week_9__Session_32___MD_1_session_for_guys_that_did_not_play.pdf | drillPdfs/<UPLOADER_UID>/Week_9__Session_32___MD_1_session_for_guys_that_did_not_play.pdf |
| Week_2__Session__7__dynamic_warm_up_and_SAQ__5v2_rondo_to_3v3_2__transitional_game__and_play_7v7.pdf | drillPdfs/<UPLOADER_UID>/Week_2__Session__7__dynamic_warm_up_and_SAQ__5v2_rondo_to_3v3_2__transitional_game__and_play_7v7.pdf |
| Week_8__Session__30_Building_out_of_the_back.pdf | drillPdfs/<UPLOADER_UID>/Week_8__Session__30_Building_out_of_the_back.pdf |
| Week_3__Session__12__Warm_up_then_game__Emphasis_on_build_up__breaking_lines__and_creating_goals.pdf | drillPdfs/<UPLOADER_UID>/Week_3__Session__12__Warm_up_then_game__Emphasis_on_build_up__breaking_lines__and_creating_goals.pdf |
| Week_5__Session_18__Defensive_organization_in_the_middle_third_to_prevent_penetration.pdf | drillPdfs/<UPLOADER_UID>/Week_5__Session_18__Defensive_organization_in_the_middle_third_to_prevent_penetration.pdf |
| Week_7__Session__26_positional_play_games.pdf | drillPdfs/<UPLOADER_UID>/Week_7__Session__26_positional_play_games.pdf |
| Week_6__Session__23___4v4_3_to_warm_up_then_11v11.pdf | drillPdfs/<UPLOADER_UID>/Week_6__Session__23___4v4_3_to_warm_up_then_11v11.pdf |
| Preseason_session__4__Rondo__passing_pattern__directional_possession__and_game.pdf | drillPdfs/<UPLOADER_UID>/Preseason_session__4__Rondo__passing_pattern__directional_possession__and_game.pdf |
| Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd.pdf | drillPdfs/<UPLOADER_UID>/Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd.pdf |
| Week_9__Session_34___MD_1_Session.pdf | drillPdfs/<UPLOADER_UID>/Week_9__Session_34___MD_1_Session.pdf |
| Week_4__Session__16_Counter_press_in_all_three_zones_as_a_focus.pdf | drillPdfs/<UPLOADER_UID>/Week_4__Session__16_Counter_press_in_all_three_zones_as_a_focus.pdf |
| Preseason_session_1.pdf | drillPdfs/<UPLOADER_UID>/Preseason_session_1.pdf |
| Week_9__Session_31___MD_1___high_press_in_the_attacking_third-2.pdf | drillPdfs/<UPLOADER_UID>/Week_9__Session_31___MD_1___high_press_in_the_attacking_third-2.pdf |
| Week_7__Session__25___possession_based_offensive_organization.pdf | drillPdfs/<UPLOADER_UID>/Week_7__Session__25___possession_based_offensive_organization.pdf |
| Week_8__Session_29_MD_1_session_positional_play_activities.pdf | drillPdfs/<UPLOADER_UID>/Week_8__Session_29_MD_1_session_positional_play_activities.pdf |
| Week_6__Session_22___exploit_numerical_advantage_in_the_final_third.pdf | drillPdfs/<UPLOADER_UID>/Week_6__Session_22___exploit_numerical_advantage_in_the_final_third.pdf |
| Building_out_of_the_back__In_possession_in_the_defensive_third_of_the_field-2.pdf | drillPdfs/<UPLOADER_UID>/Building_out_of_the_back__In_possession_in_the_defensive_third_of_the_field-2.pdf |
| Creating_chances_and_finishing_in_the_final_third__Unbalancing_the_opponent_and_runs_in_behind.pdf | drillPdfs/<UPLOADER_UID>/Creating_chances_and_finishing_in_the_final_third__Unbalancing_the_opponent_and_runs_in_behind.pdf |
| Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd_2.pdf | — NOT staged (exact dupe of Session 20, see above) |
| Week_2__Session__8_directional_possession__combine_to_finish__pre_season_session.pdf | drillPdfs/<UPLOADER_UID>/Week_2__Session__8_directional_possession__combine_to_finish__pre_season_session.pdf |
| Week_9__Session_33___MD_1_session.pdf | drillPdfs/<UPLOADER_UID>/Week_9__Session_33___MD_1_session.pdf |
| Week_4__Session__13___Counter_pressing_in_the_final_third.pdf | drillPdfs/<UPLOADER_UID>/Week_4__Session__13___Counter_pressing_in_the_final_third.pdf |
| Week_8__Session_28_recovery_session.pdf | drillPdfs/<UPLOADER_UID>/Week_8__Session_28_recovery_session.pdf |
| Preseason_session__3__passing__transitional_rondos__flying_changes-2.pdf | drillPdfs/<UPLOADER_UID>/Preseason_session__3__passing__transitional_rondos__flying_changes-2.pdf |
| Week_2__session__6___continue_to_build_fitness_base__transitional_possession_games_and_play.pdf | drillPdfs/<UPLOADER_UID>/Week_2__session__6___continue_to_build_fitness_base__transitional_possession_games_and_play.pdf |
| Unbalancing_the_opponent_and_building_up_in_the_middle_third.pdf | drillPdfs/<UPLOADER_UID>/Unbalancing_the_opponent_and_building_up_in_the_middle_third.pdf |
| Week_7__Session__27_3v3_2_and_11v11.pdf | drillPdfs/<UPLOADER_UID>/Week_7__Session__27_3v3_2_and_11v11.pdf |
| Week_5__Session__19___3v3_2_and_4v4_tournament.pdf | drillPdfs/<UPLOADER_UID>/Week_5__Session__19___3v3_2_and_4v4_tournament.pdf |
| Week_4__Session_15_Counter_pressing_in_the_defensive_third___building_out.pdf | drillPdfs/<UPLOADER_UID>/Week_4__Session_15_Counter_pressing_in_the_defensive_third___building_out.pdf |

## Import order for the parent

1. Deploy the Storage rules (`firebase deploy --only storage --project brophy-soccer-app`).
2. Upload the 34 staged PDFs to `drillPdfs/<UPLOADER_UID>/`, minting one download token per file.
3. Append `PDF: <download URL>` to each whole-session drill's `info` in `drills.json` (match by `Source:` filename).
4. Run the admin `addDoc` import of `drills.json` into `drillLibrary` (convert `__SERVER_TIMESTAMP__` markers to server timestamps first).
