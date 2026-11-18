#!/usr/bin/env python3
"""Download all 35 session PDFs from the Drive folder
1EbC7PicdvozovaPsARVKNg0D4jfrPc69 into ./pdfs/, with a manifest."""
import json, os, re, subprocess, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdfs")
os.makedirs(OUT, exist_ok=True)

FILES = [
 ("1jj8yHB0iH5SAh3JZbdGWeAGxb7C8mZAH", "Week_5__Session__17_high_press_organization_off_of_opponent_s_goal_kicks_.pdf"),
 ("1OARyoXtRJXq5j1NNLjtmAbD9bUI_Xo5r", "Week_7__Session__24___transition_D__A_from_the_midfield_third.pdf"),
 ("1QrEJJp6JAypBY2wd80V6OdhfZashcWA-", "Week_2__session__5_continue_to_build_fitness_base__while_doing_individual_and_small_group_activities.pdf"),
 ("18O5CQkLQBRgz05m6WUd53ESgV0fvIyNy", "Week_6__Session__21___4v4___3_and_6v6_tournament_to_big_goals.pdf"),
 ("1DZ0oxN9YMIIBZQTubrjvmsq7RasOptvY", "Preseason session #2 Passing patterns, 3rd man runs, building a fitness base and feel for playing.pdf"),
 ("1v73tCaQ2nfMw4wevdREUhvbKhETo1nlU", "Week_4__Session__14_Counter_pressing_in_the_middle_third.pdf"),
 ("1SBI2aQGiM1oDdo6np_l_RU-GsjzRw9mf", "Week_9__Session_32___MD_1_session_for_guys_that_did_not_play.pdf"),
 ("12PG1CA-zhFSTFLan5RkiQItjymIjG2Bp", "Week_2__Session__7__dynamic_warm_up_and_SAQ__5v2_rondo_to_3v3_2__transitional_game__and_play_7v7.pdf"),
 ("1_rDZtqnn_gcZrl7jyip3wn5hD3K_xKeg", "Week_8__Session__30_Building_out_of_the_back.pdf"),
 ("1kdicmLY_CRmc-ZTV9Ws1du4NQAE3bC0p", "Week_3__Session__12__Warm_up_then_game__Emphasis_on_build_up__breaking_lines__and_creating_goals.pdf"),
 ("1BViR0VMiTo3yjAkaizO4t1nYdWd4DGdK", "Week_5__Session_18__Defensive_organization_in_the_middle_third_to_prevent_penetration.pdf"),
 ("1wesi3-txHy8_wKtNGqu1ty6zLR9dBXa8", "Week_7__Session__26_positional_play_games.pdf"),
 ("1z_e8L7WoaTgfHdD52YgmxOPDwKqy8A-B", "Week_6__Session__23___4v4_3_to_warm_up_then_11v11.pdf"),
 ("1oCNUyMIk-LL78RAl6EUeYbRswmtiRKKg", "Preseason_session__4__Rondo__passing_pattern__directional_possession__and_game.pdf"),
 ("15wNxr-CYigldHvhEQS7p1OkPuC9z6t7W", "Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd.pdf"),
 ("1imU0eU9EeCERZgbzxJfqDAruoix4GIxT", "Week_9__Session_34___MD_1_Session.pdf"),
 ("1VR7XHw-bEK-KFMb4_XdXzOez5Sxz67BK", "Week_4__Session__16_Counter_press_in_all_three_zones_as_a_focus.pdf"),
 ("1DtENiUvlZmv7WMs8-UgRRcDjBWx0-GDg", "Preseason session #1.pdf"),
 ("1zvzTuIOM_w5RUGHk1Jxy0z5RdX7R0Jq6", "Week_9__Session_31___MD_1___high_press_in_the_attacking_third-2.pdf"),
 ("1-F4qzH7F36SoD3W4LcPJyePBUOxQZc-r", "Week_7__Session__25___possession_based_offensive_organization_.pdf"),
 ("1xtVLqWNLZFin121HGsnLESxwMmOAl-mB", "Week_8__Session_29_MD_1_session_positional_play_activities.pdf"),
 ("11_eHqHuNmY0gCVIrz52JDoRvoP4NXAKN", "Week_6__Session_22___exploit_numerical_advantage_in_the_final_third.pdf"),
 ("1HzDTDYWjjpqVaDjgKbkx1IIVR-I1wqF-", "Building_out_of_the_back__In_possession_in_the_defensive_third_of_the_field-2.pdf"),
 ("1xZ7ZviIJ50R5Yhczix8ucsHAYTSQsj3l", "Creating_chances_and_finishing_in_the_final_third__Unbalancing_the_opponent_and_runs_in_behind.pdf"),
 ("1SyK53F9hgJ4YBBs-J8Ws4onwgB5626UL", "Week_6__Session_20___creating_and_finishing_chances_in_the_final_3rd 2.pdf"),
 ("1fGAL7b6ba18qlmNNbCrE6jWz7b9gdB_z", "Week_2__Session__8_directional_possession__combine_to_finish__pre_season_session.pdf"),
 ("1vTzMwDM5EYSMoy4vcR1N5THxZ6YTCuoP", "Week_9__Session_33___MD_1_session.pdf"),
 ("1cIZGidTs9vsFpXISOsg7qCgvMSlKVHHQ", "Week_4__Session__13___Counter_pressing_in_the_final_third.pdf"),
 ("1O0X7rAa0YnAeFVJO7iEjbCkfDQNDekOV", "Week_8__Session_28_recovery_session.pdf"),
 ("1NAAESwmD0JM1SDLcDQzIJUQeaYcanMO1", "Preseason_session__3__passing__transitional_rondos__flying_changes-2.pdf"),
 ("1YvQEPbKoPdo66PKoN6rJXDfTbDVoHVig", "Week_2__session__6___continue_to_build_fitness_base__transitional_possession_games_and_play.pdf"),
 ("1hqBQ4Y3HRRqhhlGk9lU3mi2PyyldwSoU", "Unbalancing_the_opponent_and_building_up_in_the_middle_third.pdf"),
 ("1pMabLoQePknOr0LP59FQTw1n3tP_CTKn", "Week_7__Session__27_3v3_2_and_11v11.pdf"),
 ("18IxGiTXhReu0nOgcFUUWHoGGo0MV3LbB", "Week_5__Session__19___3v3_2_and_4v4_tournament.pdf"),
 ("1DIPGQCJLDjahqB7UkFK6JMQMkjWdM5H9", "Week_4__Session_15_Counter_pressing_in_the_defensive_third___building_out.pdf"),
]

def safe(name):
    base = name[:-4] if name.lower().endswith(".pdf") else name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_")
    return base[:120] + ".pdf"

manifest = []
for fid, name in FILES:
    local = safe(name)
    path = os.path.join(OUT, local)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        print("SKIP exists:", local)
        manifest.append({"drive_id": fid, "drive_name": name, "local": local, "size": os.path.getsize(path)})
        continue
    r = subprocess.run(
        ["/opt/hatch/bin/hatch_gws_cli", "drive", "files", "get",
         "--params", json.dumps({"fileId": fid, "alt": "media"}),
         "--output", path],
        capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(path) or os.path.getsize(path) == 0:
        print("FAIL:", name, (r.stderr or r.stdout)[-300:])
        continue
    print("OK:", local, os.path.getsize(path))
    manifest.append({"drive_id": fid, "drive_name": name, "local": local, "size": os.path.getsize(path)})

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
print("downloaded:", len(manifest), "of", len(FILES))
