export type DemoDirection = "north" | "south" | "east" | "west";
export type DemoPatientAssetKey = "emika" | "krit" | "rattana" | "wichai";

export type DemoPatientAssetProfile = {
  id?: number | null;
  name?: string | null;
  gender?: string | null;
  mobility_type?: string | null;
  care_level?: string | null;
};

export const demoPatientAssetKeys: DemoPatientAssetKey[] = ["emika", "krit", "rattana", "wichai"];

const ROOT = "/demo-theater";

function asset(path: string): string {
  return `${ROOT}/${path.replaceAll("\\", "/")}`;
}

function numberedFrames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const frame = String(index).padStart(3, "0");
    return asset(`${base}/frame_${frame}.png`);
  });
}

function directedFrames(base: string, count: number): Record<DemoDirection, string[]> {
  return {
    north: numberedFrames(`${base}/north`, count),
    south: numberedFrames(`${base}/south`, count),
    east: numberedFrames(`${base}/east`, count),
    west: numberedFrames(`${base}/west`, count),
  };
}

function directedRotations(base: string): Record<DemoDirection, string[]> {
  return {
    north: [asset(`${base}/rotations/north.png`)],
    south: [asset(`${base}/rotations/south.png`)],
    east: [asset(`${base}/rotations/east.png`)],
    west: [asset(`${base}/rotations/west.png`)],
  };
}

export const demoTheaterAssets = {
  fontUrl: asset("fonts/pixelart.ttf"),
  brand: asset("brand/easeai-icon.png"),
  props: {
    ground: asset("props/ground.png"),
    bedH: asset("props/room_bed_h.png"),
    bedV: asset("props/room_bed_v.png"),
    table: asset("props/room_bedside_table.png"),
    chair: asset("props/room_armchair.png"),
    cabinet: asset("props/room_cabinet.png"),
    ecgCart: asset("props/room_ecg_cart.png"),
    ecgScreen: asset("props/room_ecg_screen.png"),
    flower: asset("props/room_flower.png"),
    ivStand: asset("props/room_iv_stand_b.png"),
    nurseStation: asset("props/operation_console_full.png"),
    light: asset("props/maternity_light.png"),
    ceilingLight: asset("props/operation_light.png"),
  },
  devices: {
    airconIdle: [asset("devices/aircon/rotations/south.png")],
    airconActive: numberedFrames("devices/aircon/animations/animation-65529e8c/south", 9),
  },
  staff: {
    nurse: {
      idle: directedRotations("characters/a_nurse"),
      phone: {
        south: numberedFrames(
          "characters/a_nurse/animations/playing_the_smart_phone-73a2ede8/south",
          11,
        ),
      },
      walk: directedFrames("characters/a_nurse/animations/Walking-f30a6892", 6),
    },
    maleNurse: {
      idle: directedRotations("characters/a_male_nurse"),
      phone: {
        south: numberedFrames(
          "characters/a_male_nurse/animations/playing_the_smart_phone-291d73e2/south",
          9,
        ),
      },
      walk: {
        north: numberedFrames("characters/a_male_nurse/animations/Walking-5950b10a/north", 6),
        south: numberedFrames("characters/a_male_nurse/animations/Walking-5950b10a/south", 6),
        east: numberedFrames("characters/a_male_nurse/animations/Walking-5950b10a/east", 6),
        west: numberedFrames("characters/a_male_nurse/animations/Walking-5950b10a/east", 6),
      },
    },
  },
  patients: {
    emika: {
      label: "Emika",
      idle: numberedFrames("characters/Emika/animations/Breathing_Idle-7697ef50/south", 4),
      falling: numberedFrames("characters/Emika/animations/Falling-a257d09a/south", 7),
      helping: numberedFrames("characters/Emika/animations/Getup_1-f6eb306f/south", 11),
      recovered: [asset("characters/Emika/rotations/south.png")],
    },
    krit: {
      label: "Krit",
      idle: numberedFrames("characters/Krit/animations/Breathing_Idle-fd118402/south", 4),
      falling: numberedFrames(
        "characters/Krit/animations/He_s_falling_on_the_floor-d53a0ac4/south",
        9,
      ),
      helping: numberedFrames(
        "characters/Krit/animations/The_female_nurse_is_helping_this_old_man_to_stand-e95526fb/south",
        9,
      ),
      recovered: [asset("characters/Krit/rotations/south.png")],
    },
    rattana: {
      label: "Rattana",
      idle: [asset("characters/Rattana/rotations/south.png")],
      falling: numberedFrames(
        "characters/Rattana/animations/Grandma_falling_down_on_the_floor_from_wheelchair.-b6b830c9/south",
        9,
      ),
      helping: numberedFrames(
        "characters/Rattana/animations/The_female_doctor_helping_the_grandma_to_sit_wheel-24d23c2a/south",
        9,
      ),
      recovered: [asset("characters/Rattana/rotations/south.png")],
    },
    wichai: {
      label: "Wichai",
      idle: [asset("characters/Wichai/rotations/south.png")],
      falling: numberedFrames(
        "characters/Wichai/animations/The_old_man_clutched_his_chest_hunched_over_and_wr-d4f1725f/south",
        9,
      ),
      helping: numberedFrames(
        "characters/Wichai/animations/The_doctor_doing_CPR_help_The_bedridden_Patient.-15603b38/south",
        9,
      ),
      recovered: [asset("characters/Wichai/rotations/south.png")],
    },
  } satisfies Record<
    DemoPatientAssetKey,
    {
      label: string;
      idle: string[];
      falling: string[];
      helping: string[];
      recovered: string[];
    }
  >,
};

export function patientAssetKeyForName(name: string | null | undefined, fallbackIndex = 0): DemoPatientAssetKey {
  const explicit = explicitPatientAssetKeyForName(name);
  if (explicit) return explicit;
  return demoPatientAssetKeys[Math.abs(fallbackIndex) % demoPatientAssetKeys.length];
}

export function patientAssetKeyForProfile(
  profile: DemoPatientAssetProfile | null | undefined,
  fallbackIndex = 0,
): DemoPatientAssetKey {
  const explicit = explicitPatientAssetKeyForName(profile?.name);
  if (explicit) return explicit;

  const mobility = (profile?.mobility_type ?? "").toLowerCase();
  const gender = (profile?.gender ?? "").toLowerCase();
  const careLevel = (profile?.care_level ?? "").toLowerCase();
  if (mobility.includes("wheel") || careLevel === "critical") return "rattana";
  if (gender.includes("male")) return fallbackIndex % 2 === 0 ? "krit" : "wichai";
  if (gender.includes("female")) return fallbackIndex % 2 === 0 ? "emika" : "rattana";

  const stableIndex = profile?.id != null ? profile.id : fallbackIndex;
  return demoPatientAssetKeys[Math.abs(stableIndex) % demoPatientAssetKeys.length];
}

function explicitPatientAssetKeyForName(name: string | null | undefined): DemoPatientAssetKey | null {
  const normalized = (name ?? "").toLowerCase();
  if (normalized.includes("emika")) return "emika";
  if (normalized.includes("rattana")) return "rattana";
  if (normalized.includes("wichai")) return "wichai";
  if (normalized.includes("krit")) return "krit";
  return null;
}
