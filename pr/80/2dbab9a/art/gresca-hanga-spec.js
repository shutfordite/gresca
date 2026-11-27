/*
 * Gresca · Hanga Dawn art spec  v1.5.0
 * Standalone, data-only module. No drawing code and no dependencies.
 * v1.5.0 (additive): the environment for real maps: tree sets, treeline, bushes, rocks, sky, sun and backdrop peaks
 * (the Pyrenees set first), new palette roles, and new maps keys for El Tarter. Nothing existing changes. Notes:
 * docs/art/HANGA-v1.5.md in the game repo.
 * version: '1.5.0' (the PR check looks for this form; the data key is "version" below).
 * v1.4.0 (additive): rider twist, head yaw with the face vector, body pitch and the real camera pitch as an options
 * argument to projectRider; brake, switch-ski and flip-tuck poses; true-scale rider guidance. Calls without the new
 * options or state fields give exactly the v1.3 result. Notes: docs/art/HANGA-v1.4.md in the game repo.
 * Loads in the browser (window.HANGA) and in Node (require), so the test harness can check against it.
 *
 * Units: metres, angles in degrees, colours as sRGB hex. Code should refer to palette ROLE names
 * (HANGA.palette.indigo), never raw hex. See HANGA-INTEGRATION.md for how it maps to index.html.
 */
(function (root) {
'use strict';
var HANGA = {
 "name": "Gresca · Hanga Dawn",
 "version": "1.5.0",
 "contrastTargets": [
  {
   "a": "kickSide",
   "b": "pisteLit",
   "min": 2.0,
   "why": "Kicker side against lit piste"
  },
  {
   "a": "kickSide",
   "b": "pisteShade",
   "min": 1.8,
   "why": "Kicker side against piste in shade"
  },
  {
   "a": "kickFace",
   "b": "pisteLit",
   "min": 1.3,
   "why": "Kicker face against lit piste (plus a hue change)"
  },
  {
   "a": "pisteEdge",
   "b": "pisteLit",
   "min": 3.0,
   "why": "Piste edge band"
  },
  {
   "a": "powderLit",
   "b": "pisteLit",
   "min": 1.2,
   "why": "Powder against groomed piste"
  },
  {
   "a": "key",
   "b": "kickFace",
   "min": 4.5,
   "why": "Lip band on the kicker face"
  },
  {
   "a": "mapFeature",
   "b": "paper",
   "min": 3.0,
   "why": "Minimap feature dots"
  },
  {
   "a": "paper",
   "b": "vermilion",
   "min": 3.0,
   "why": "Popup text and Drop in label, 18 px and up"
  },
  {
   "a": "key",
   "b": "pisteLit",
   "min": 4.5,
   "why": "Rails, poles and keylines"
  }
 ],
 "units": "metres; colours are sRGB hex",
 "world": {
  "axes": "x east, y north, z up (metres), the same east-north-up frame as gresca-terrain-1",
  "procedural": "Procedural map: world x = game x, world y = −game y (downhill on that map is south).",
  "compass": "Headings are compass degrees, clockwise from north. Camera heading, backdrop headings and the sun all use compass degrees."
 },
 "maps": {
  "procedural": {
   "sun": {
    "azimuthDeg": 245,
    "elevationDeg": 22,
    "vector": [
     -0.8403,
     -0.3918,
     0.3746
    ]
   },
   "treeSet": "sugi",
   "treelineM": null,
   "meanSlopeDeg": 17,
   "credits": []
  },
  "el-tarter": {
   "sun": {
    "azimuthDeg": 110,
    "elevationDeg": 16,
    "vector": [
     0.9033,
     -0.3288,
     0.2756
    ]
   },
   "treeSet": "pine",
   "treelineM": 2300,
   "meanSlopeDeg": 16.5,
   "credits": [
    "Elevation: AWS Terrain Tiles",
    "Pistes and lifts © OpenStreetMap contributors (ODbL)"
   ],
   "note": "The El Tarter runs fall roughly north, so a dawn sun from the east-southeast lights them from the side. Treeline and meanSlopeDeg are art-directed defaults; replace them with values from data when the baker has them (meanSlopeDeg = total drop over total length along the chosen piste).",
   "backdrop": "pyrenees",
   "treeline": {
    "treelineM": 2300,
    "bandUpToM": {
     "forest": 1950,
     "thinning": 2200,
     "open": 2300,
     "krummholz": 2420
    },
    "aspectShiftM": {
     "north": -60,
     "east": 0,
     "south": 60,
     "west": 0
    },
    "courseBandStartS": {
     "krummholz": 235,
     "open": 599,
     "thinning": 929,
     "forest": 1989
    },
    "note": "Absolute altitudes for El Tarter (treelineM 2300 + environment.treeline.defaults offsets). The run starts above the treeline at 2462 m, so it rides from alpine rock through krummholz and thinning trees into forest at the bottom. courseBandStartS is the distance along the course (m of s) where it first passes each band limit, measured on the baked terrain; the first 235 m are alpine."
   },
   "meanSlopeDegData": 14.89,
   "heightRangeM": {
    "min": 1570.3,
    "max": 2749.1
   },
   "courseAltitudeM": {
    "start": 2462,
    "finish": 1700.5
   },
   "startWorld": {
    "x": 30.8,
    "y": -2085.5
   },
   "fallLineCompassDeg": 346,
   "sunData": {
    "azimuthDeg": 76,
    "elevationDeg": 16
   },
   "dataNote": "Data-derived values from maps/el-tarter.course.json and maps/el-tarter.terrain.json; the art-directed keys above are unchanged. meanSlopeDegData is the course file's meanSlopeDeg, atan(drop / length) = atan((2462.0 - 1700.5) / 2864.7). heightRangeM is the terrain file's heights minM and maxM. courseAltitudeM is the ground height at s = 0 and s = finishS (finishS 2864.7). startWorld is the course point at s = 0 (world x east, y north, m from the terrain origin 42.5775 N, 1.655 E). fallLineCompassDeg is the compass bearing from the start to the finish. sunData is the sun the baker put in the course file, which is not the art-directed sun above: the baked azimuth 76 is 90 degrees off the fall line, as terrain.sun.rule asks; the art-directed 110 is 124 degrees off it. Which wins is open (see HANGA-v1.5.md)."
  }
 },
 "palette": {
  "key": "#26324F",
  "paper": "#F4EEE1",
  "indigo": "#2E4A7D",
  "indigoS": "#22375E",
  "vermilion": "#D9553B",
  "vermilionS": "#AE3F2A",
  "paperS": "#D9D1BF",
  "lens": "#F2B37A",
  "pisteLit": "#F8F6F0",
  "pisteMid": "#ECE8E0",
  "pisteShade": "#C8D0E2",
  "powderLit": "#DADFEA",
  "powderMid": "#C3CBDD",
  "powderShade": "#A3B1CF",
  "cord": "#E4E2E6",
  "pisteEdge": "#6A7FA8",
  "skyTop": "#34528A",
  "skyMid": "#8EA3C9",
  "skyDawn": "#F0C3AE",
  "skyHorizon": "#F7DCCB",
  "sun": "#FBE6D6",
  "fog": "#F2D5C6",
  "mtnFar": "#A9B7D3",
  "mtnFarS": "#8C9DC0",
  "mtnFarCap": "#F4EEE1",
  "mtnNear": "#7F93BB",
  "mtnNearS": "#6A7FA8",
  "mtnNearCap": "#EEE8DA",
  "sugi": "#2F4B3E",
  "sugiS": "#22382E",
  "trunk": "#5A3E2E",
  "rock": "#6E7894",
  "rockS": "#525B76",
  "kickFace": "#F4CDB6",
  "kickSide": "#7F93BB",
  "flag": "#D9553B",
  "mapFeature": "#8A5A1E",
  "pine": "#33503F",
  "pineS": "#24392D",
  "railHi": "#9FB0D3",
  "spray": "#FBF8F1",
  "sprayS": "#C3CCE0",
  "pineLit": "#4F7058",
  "fir": "#2C4B4C",
  "firS": "#1F3637",
  "firLit": "#42696A",
  "snowLoad": "#E8EDF5",
  "snowLoadS": "#BFC9DE",
  "krummholz": "#55684F",
  "krummholzS": "#3C4B3B",
  "scrub": "#7A6F58",
  "scrubS": "#5C5342",
  "rhodo": "#7A5A55",
  "rockLit": "#8F98B2",
  "scree": "#A2A8BC",
  "screeS": "#8088A2",
  "cliff": "#4C566F",
  "mtnMid": "#97A8CB",
  "mtnMidS": "#7F92B9",
  "mtnMidCap": "#F1EBDD",
  "alpenglow": "#F0A98E",
  "sunGlow": "#F8C9A8"
 },
 "camera": {
  "chasePitchDeg": 20,
  "menuPitchDeg": 6,
  "slopeFollow": {
   "tilt": 0.55,
   "lookAheadM": 30,
   "riderMarginDeg": 6,
   "note": "Recommended change: the camera pitch follows the slope only partly. Aim at the ground 30 m ahead, then set pitch = levelPitch + 0.55 × (fullPitch − levelPitch), where levelPitch looks at that point as if the ground were level and fullPitch looks at the real ground. Clamp it so the rider stays at least 6° inside the bottom of the frame. On a steep pitch the ground then visibly drops away and the backdrop rises into view; with full tilt (1.0, the current rule) every gradient looks like flat ground. Tune on a phone between 0.4 and 0.7."
  },
  "note": "Pitch is how far the camera looks down on the rider, after allowing for the slope. 20 deg suits CAMBACK=10 / CAMH=7.6 on a typical piste.",
  "riderPitch": "v1.4 (F1). chasePitchDeg is only the default for projectRider callers that pass no pitch. The game passes the camera's real look-down at the rider each frame as options.cameraPitchDeg (rider.rotations.cameraPitch), so the rider is not seen side-on while the ground is seen from above."
 },
 "rider": {
  "widths": {
   "torso": 0.34,
   "leg": 0.17,
   "arm": 0.125,
   "boot": 0.14,
   "glove": 0.07,
   "head": 0.16,
   "ski": 0.07,
   "pole": 0.03,
   "board": 0.27,
   "keyline": 0.012,
   "keylineMinPx": 1
  },
  "joints": {
   "ski": {
    "ankL": [
     -0.12,
     0.1,
     0.0
    ],
    "ankR": [
     0.12,
     0.1,
     0.0
    ],
    "kneeL": [
     -0.13,
     0.5,
     0.14
    ],
    "kneeR": [
     0.13,
     0.5,
     0.14
    ],
    "hipL": [
     -0.11,
     0.9,
     -0.04
    ],
    "hipR": [
     0.11,
     0.9,
     -0.04
    ],
    "hipC": [
     0,
     0.9,
     -0.04
    ],
    "neck": [
     0,
     1.42,
     0.06
    ],
    "head": [
     0,
     1.6,
     0.09
    ],
    "shL": [
     -0.2,
     1.38,
     0.04
    ],
    "shR": [
     0.2,
     1.38,
     0.04
    ],
    "elbL": [
     -0.3,
     1.12,
     0.14
    ],
    "elbR": [
     0.3,
     1.12,
     0.14
    ],
    "hanL": [
     -0.33,
     0.92,
     0.3
    ],
    "hanR": [
     0.33,
     0.92,
     0.3
    ],
    "poleL": [
     -0.4,
     0,
     -0.3
    ],
    "poleR": [
     0.4,
     0,
     -0.3
    ],
    "skiLt": [
     -0.12,
     0.02,
     -0.9
    ],
    "skiLn": [
     -0.12,
     0.02,
     0.94
    ],
    "skiRt": [
     0.12,
     0.02,
     -0.8
    ],
    "skiRn": [
     0.12,
     0.02,
     0.95
    ]
   },
   "board": {
    "ankF": [
     0,
     0.1,
     0.27
    ],
    "ankB": [
     0,
     0.1,
     -0.27
    ],
    "kneeF": [
     0.13,
     0.48,
     0.24
    ],
    "kneeB": [
     0.13,
     0.48,
     -0.24
    ],
    "hipF": [
     0,
     0.88,
     0.1
    ],
    "hipB": [
     0,
     0.88,
     -0.1
    ],
    "hipC": [
     0,
     0.88,
     0
    ],
    "neck": [
     0.04,
     1.4,
     0.02
    ],
    "head": [
     0.07,
     1.58,
     0.06
    ],
    "shF": [
     0.04,
     1.37,
     0.18
    ],
    "shB": [
     0.04,
     1.37,
     -0.16
    ],
    "elbF": [
     0.12,
     1.13,
     0.38
    ],
    "elbB": [
     0.14,
     1.12,
     -0.34
    ],
    "hanF": [
     0.16,
     0.98,
     0.56
    ],
    "hanB": [
     0.22,
     0.96,
     -0.48
    ],
    "tail": [
     0,
     0.03,
     -0.79
    ],
    "nose": [
     0,
     0.03,
     0.79
    ]
   }
  },
  "face": {
   "ski": [
    0,
    0,
    1
   ],
   "board": [
    0.35,
    0,
    0.94
   ]
  },
  "colourways": {
   "ski": {
    "jacket": "indigo",
    "pants": "vermilion",
    "helmet": "paper",
    "frame": "key",
    "lens": "lens",
    "strap": "vermilion",
    "glove": "key",
    "boot": "key",
    "equip": "vermilion",
    "equipAccent": "paper",
    "pole": "key"
   },
   "board": {
    "jacket": "vermilion",
    "pants": "indigo",
    "helmet": "paper",
    "frame": "key",
    "lens": "lens",
    "strap": "indigo",
    "glove": "key",
    "boot": "key",
    "equip": "vermilion",
    "equipAccent": "paper",
    "pole": "key"
   }
  },
  "shadeOf": {
   "indigo": "indigoS",
   "vermilion": "vermilionS",
   "paper": "paperS",
   "key": "key",
   "lens": "lens"
  },
  "parts": {
   "ski": [
    {
     "id": "skiL",
     "kind": "equip",
     "joints": [
      "skiLt",
      "skiLn"
     ],
     "width": "ski",
     "colour": "equip"
    },
    {
     "id": "skiR",
     "kind": "equip",
     "joints": [
      "skiRt",
      "skiRn"
     ],
     "width": "ski",
     "colour": "equip"
    },
    {
     "id": "poleL",
     "kind": "limb",
     "joints": [
      "hanL",
      "poleL"
     ],
     "width": "pole",
     "colour": "pole"
    },
    {
     "id": "poleR",
     "kind": "limb",
     "joints": [
      "hanR",
      "poleR"
     ],
     "width": "pole",
     "colour": "pole"
    },
    {
     "id": "legL",
     "kind": "limb",
     "joints": [
      "hipL",
      "kneeL",
      "ankL"
     ],
     "width": "leg",
     "colour": "pants"
    },
    {
     "id": "legR",
     "kind": "limb",
     "joints": [
      "hipR",
      "kneeR",
      "ankR"
     ],
     "width": "leg",
     "colour": "pants"
    },
    {
     "id": "bootL",
     "kind": "boot",
     "joints": [
      "ankL"
     ],
     "width": "boot",
     "colour": "boot"
    },
    {
     "id": "bootR",
     "kind": "boot",
     "joints": [
      "ankR"
     ],
     "width": "boot",
     "colour": "boot"
    },
    {
     "id": "torso",
     "kind": "torso",
     "joints": [
      "neck",
      "hipC"
     ],
     "width": "torso",
     "colour": "jacket"
    },
    {
     "id": "armL",
     "kind": "limb",
     "joints": [
      "shL",
      "elbL",
      "hanL"
     ],
     "width": "arm",
     "colour": "jacket"
    },
    {
     "id": "armR",
     "kind": "limb",
     "joints": [
      "shR",
      "elbR",
      "hanR"
     ],
     "width": "arm",
     "colour": "jacket"
    },
    {
     "id": "gloveL",
     "kind": "circle",
     "joints": [
      "hanL"
     ],
     "width": "glove",
     "colour": "glove"
    },
    {
     "id": "gloveR",
     "kind": "circle",
     "joints": [
      "hanR"
     ],
     "width": "glove",
     "colour": "glove"
    },
    {
     "id": "head",
     "kind": "head",
     "joints": [
      "head"
     ],
     "width": "head",
     "colour": "helmet"
    }
   ],
   "board": [
    {
     "id": "board",
     "kind": "equip",
     "joints": [
      "tail",
      "nose"
     ],
     "width": "board",
     "colour": "equip"
    },
    {
     "id": "legF",
     "kind": "limb",
     "joints": [
      "hipF",
      "kneeF",
      "ankF"
     ],
     "width": "leg",
     "colour": "pants"
    },
    {
     "id": "legB",
     "kind": "limb",
     "joints": [
      "hipB",
      "kneeB",
      "ankB"
     ],
     "width": "leg",
     "colour": "pants"
    },
    {
     "id": "bootF",
     "kind": "boot",
     "joints": [
      "ankF"
     ],
     "width": "boot",
     "colour": "boot"
    },
    {
     "id": "bootB",
     "kind": "boot",
     "joints": [
      "ankB"
     ],
     "width": "boot",
     "colour": "boot"
    },
    {
     "id": "torso",
     "kind": "torso",
     "joints": [
      "neck",
      "hipC"
     ],
     "width": "torso",
     "colour": "jacket"
    },
    {
     "id": "armF",
     "kind": "limb",
     "joints": [
      "shF",
      "elbF",
      "hanF"
     ],
     "width": "arm",
     "colour": "jacket"
    },
    {
     "id": "armB",
     "kind": "limb",
     "joints": [
      "shB",
      "elbB",
      "hanB"
     ],
     "width": "arm",
     "colour": "jacket"
    },
    {
     "id": "gloveF",
     "kind": "circle",
     "joints": [
      "hanF"
     ],
     "width": "glove",
     "colour": "glove"
    },
    {
     "id": "gloveB",
     "kind": "circle",
     "joints": [
      "hanB"
     ],
     "width": "glove",
     "colour": "glove"
    },
    {
     "id": "head",
     "kind": "head",
     "joints": [
      "head"
     ],
     "width": "head",
     "colour": "helmet"
    }
   ]
  },
  "poses": {
   "ski": {
    "ride": {
     "label": "Ride",
     "roll": 0,
     "lift": 0,
     "move": {}
    },
    "carveL": {
     "label": "Carve left",
     "roll": 20,
     "lift": 0,
     "move": {
      "kneeL": [
       0,
       -0.03,
       0.05
      ],
      "kneeR": [
       0,
       -0.03,
       0.05
      ],
      "hipL": [
       0,
       -0.05,
       0
      ],
      "hipR": [
       0,
       -0.05,
       0
      ],
      "hipC": [
       0,
       -0.05,
       0
      ]
     }
    },
    "carveR": {
     "label": "Carve right",
     "roll": -20,
     "lift": 0,
     "move": {
      "kneeL": [
       0,
       -0.03,
       0.05
      ],
      "kneeR": [
       0,
       -0.03,
       0.05
      ],
      "hipL": [
       0,
       -0.05,
       0
      ],
      "hipR": [
       0,
       -0.05,
       0
      ],
      "hipC": [
       0,
       -0.05,
       0
      ]
     }
    },
    "crouch": {
     "label": "Crouch / brake / approach",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipL": [
       0,
       -0.18,
       -0.06
      ],
      "hipR": [
       0,
       -0.18,
       -0.06
      ],
      "hipC": [
       0,
       -0.18,
       -0.06
      ],
      "kneeL": [
       0,
       -0.1,
       0.08
      ],
      "kneeR": [
       0,
       -0.1,
       0.08
      ],
      "neck": [
       0,
       -0.22,
       0.14
      ],
      "head": [
       0,
       -0.22,
       0.14
      ],
      "shL": [
       0,
       -0.22,
       0.14
      ],
      "shR": [
       0,
       -0.22,
       0.14
      ],
      "elbL": [
       0,
       -0.2,
       0.16
      ],
      "elbR": [
       0,
       -0.2,
       0.16
      ],
      "hanL": [
       0,
       -0.18,
       0.2
      ],
      "hanR": [
       0,
       -0.18,
       0.2
      ],
      "poleL": [
       0,
       0,
       -0.1
      ],
      "poleR": [
       0,
       0,
       -0.1
      ]
     }
    },
    "air": {
     "label": "Air (tuck)",
     "roll": 0,
     "lift": 0.5,
     "move": {
      "ankL": [
       0,
       0.26,
       0
      ],
      "ankR": [
       0,
       0.26,
       0
      ],
      "skiLt": [
       0,
       0.26,
       0
      ],
      "skiLn": [
       0,
       0.26,
       0
      ],
      "skiRt": [
       0,
       0.26,
       0
      ],
      "skiRn": [
       0,
       0.26,
       0
      ],
      "kneeL": [
       0,
       0.16,
       0.16
      ],
      "kneeR": [
       0,
       0.16,
       0.16
      ],
      "hipL": [
       0,
       -0.04,
       -0.04
      ],
      "hipR": [
       0,
       -0.04,
       -0.04
      ],
      "hipC": [
       0,
       -0.04,
       -0.04
      ],
      "neck": [
       0,
       -0.1,
       0.14
      ],
      "head": [
       0,
       -0.1,
       0.14
      ],
      "shL": [
       0,
       -0.1,
       0.14
      ],
      "shR": [
       0,
       -0.1,
       0.14
      ],
      "elbL": [
       0.06,
       -0.1,
       0.12
      ],
      "elbR": [
       -0.06,
       -0.1,
       0.12
      ],
      "hanL": [
       0.12,
       -0.06,
       0.18
      ],
      "hanR": [
       -0.12,
       -0.06,
       0.18
      ],
      "poleL": [
       0.2,
       0.55,
       -0.15
      ],
      "poleR": [
       -0.2,
       0.55,
       -0.15
      ]
     }
    },
    "land": {
     "label": "Landing (compression)",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipL": [
       0,
       -0.26,
       -0.1
      ],
      "hipR": [
       0,
       -0.26,
       -0.1
      ],
      "hipC": [
       0,
       -0.26,
       -0.1
      ],
      "kneeL": [
       0,
       -0.14,
       0.12
      ],
      "kneeR": [
       0,
       -0.14,
       0.12
      ],
      "neck": [
       0,
       -0.3,
       0.18
      ],
      "head": [
       0,
       -0.3,
       0.18
      ],
      "shL": [
       0,
       -0.3,
       0.18
      ],
      "shR": [
       0,
       -0.3,
       0.18
      ],
      "elbL": [
       0,
       -0.24,
       0.22
      ],
      "elbR": [
       0,
       -0.24,
       0.22
      ],
      "hanL": [
       -0.06,
       -0.2,
       0.3
      ],
      "hanR": [
       0.06,
       -0.2,
       0.3
      ],
      "poleL": [
       0,
       0,
       -0.05
      ],
      "poleR": [
       0,
       0,
       -0.05
      ]
     }
    },
    "grind": {
     "label": "Grind (50-50)",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipL": [
       0,
       -0.08,
       0
      ],
      "hipR": [
       0,
       -0.08,
       0
      ],
      "hipC": [
       0,
       -0.08,
       0
      ],
      "kneeL": [
       0,
       -0.05,
       0.04
      ],
      "kneeR": [
       0,
       -0.05,
       0.04
      ],
      "elbL": [
       -0.16,
       0.12,
       -0.06
      ],
      "elbR": [
       0.16,
       0.12,
       -0.06
      ],
      "hanL": [
       -0.3,
       0.25,
       -0.18
      ],
      "hanR": [
       0.3,
       0.25,
       -0.18
      ],
      "poleL": [
       -0.45,
       0.35,
       0
      ],
      "poleR": [
       0.45,
       0.35,
       0
      ]
     }
    },
    "wipeout": {
     "label": "Wipeout",
     "roll": 78,
     "lift": 0,
     "move": {
      "elbL": [
       -0.1,
       0.15,
       0
      ],
      "hanL": [
       -0.15,
       0.4,
       0
      ],
      "elbR": [
       0.1,
       0.15,
       0
      ],
      "hanR": [
       0.25,
       0.3,
       0
      ],
      "kneeR": [
       0.1,
       -0.05,
       0
      ],
      "poleL": [
       -0.6,
       0.6,
       0.2
      ],
      "poleR": [
       0.5,
       0.8,
       -0.1
      ]
     }
    },
    "brakeL": {
     "label": "Brake, skis turned left (hockey stop)",
     "roll": 0,
     "lift": 0,
     "twistDeg": -80,
     "headYawDeg": 0,
     "move": {
      "hipL": [
       -0.08,
       -0.22,
       0
      ],
      "hipR": [
       -0.08,
       -0.22,
       0
      ],
      "kneeL": [
       -0.07,
       -0.12,
       0.06
      ],
      "kneeR": [
       -0.07,
       -0.12,
       0.06
      ],
      "hipC": [
       0,
       -0.22,
       -0.08
      ],
      "neck": [
       0,
       -0.24,
       -0.02
      ],
      "head": [
       0,
       -0.24,
       -0.02
      ],
      "shL": [
       0,
       -0.24,
       -0.02
      ],
      "shR": [
       0,
       -0.24,
       -0.02
      ],
      "elbL": [
       -0.04,
       -0.2,
       0.06
      ],
      "elbR": [
       0.04,
       -0.2,
       0.06
      ],
      "hanL": [
       -0.06,
       -0.16,
       0.1
      ],
      "hanR": [
       0.06,
       -0.16,
       0.1
      ],
      "poleL": [
       0,
       0,
       -0.05
      ],
      "poleR": [
       0,
       0,
       -0.05
      ]
     }
    },
    "brakeR": {
     "label": "Brake, skis turned right (hockey stop)",
     "roll": 0,
     "lift": 0,
     "twistDeg": 80,
     "headYawDeg": 0,
     "move": {
      "hipL": [
       0.08,
       -0.22,
       0
      ],
      "hipR": [
       0.08,
       -0.22,
       0
      ],
      "kneeL": [
       0.07,
       -0.12,
       0.06
      ],
      "kneeR": [
       0.07,
       -0.12,
       0.06
      ],
      "hipC": [
       0,
       -0.22,
       -0.08
      ],
      "neck": [
       0,
       -0.24,
       -0.02
      ],
      "head": [
       0,
       -0.24,
       -0.02
      ],
      "shL": [
       0,
       -0.24,
       -0.02
      ],
      "shR": [
       0,
       -0.24,
       -0.02
      ],
      "elbL": [
       -0.04,
       -0.2,
       0.06
      ],
      "elbR": [
       0.04,
       -0.2,
       0.06
      ],
      "hanL": [
       -0.06,
       -0.16,
       0.1
      ],
      "hanR": [
       0.06,
       -0.16,
       0.1
      ],
      "poleL": [
       0,
       0,
       -0.05
      ],
      "poleR": [
       0,
       0,
       -0.05
      ]
     }
    },
    "switchL": {
     "label": "Switch, looking over the left shoulder",
     "roll": 0,
     "lift": 0,
     "twistDeg": 35,
     "headYawDeg": -90,
     "move": {
      "hipL": [
       0,
       -0.1,
       -0.1
      ],
      "hipR": [
       0,
       -0.1,
       -0.1
      ],
      "hipC": [
       0,
       -0.1,
       -0.1
      ],
      "kneeL": [
       0,
       -0.06,
       -0.04
      ],
      "kneeR": [
       0,
       -0.06,
       -0.04
      ],
      "neck": [
       0,
       -0.1,
       -0.08
      ],
      "head": [
       0,
       -0.1,
       -0.08
      ],
      "shL": [
       0,
       -0.1,
       -0.08
      ],
      "shR": [
       0,
       -0.1,
       -0.08
      ],
      "elbL": [
       -0.06,
       -0.06,
       -0.06
      ],
      "elbR": [
       0.06,
       -0.06,
       -0.06
      ],
      "hanL": [
       -0.1,
       -0.02,
       -0.12
      ],
      "hanR": [
       0.1,
       -0.02,
       -0.12
      ]
     }
    },
    "switchR": {
     "label": "Switch, looking over the right shoulder",
     "roll": 0,
     "lift": 0,
     "twistDeg": -35,
     "headYawDeg": 90,
     "move": {
      "hipL": [
       0,
       -0.1,
       -0.1
      ],
      "hipR": [
       0,
       -0.1,
       -0.1
      ],
      "hipC": [
       0,
       -0.1,
       -0.1
      ],
      "kneeL": [
       0,
       -0.06,
       -0.04
      ],
      "kneeR": [
       0,
       -0.06,
       -0.04
      ],
      "neck": [
       0,
       -0.1,
       -0.08
      ],
      "head": [
       0,
       -0.1,
       -0.08
      ],
      "shL": [
       0,
       -0.1,
       -0.08
      ],
      "shR": [
       0,
       -0.1,
       -0.08
      ],
      "elbL": [
       -0.06,
       -0.06,
       -0.06
      ],
      "elbR": [
       0.06,
       -0.06,
       -0.06
      ],
      "hanL": [
       -0.1,
       -0.02,
       -0.12
      ],
      "hanR": [
       0.1,
       -0.02,
       -0.12
      ]
     }
    },
    "tuck": {
     "label": "Flip tuck",
     "roll": 0,
     "lift": 0.5,
     "move": {
      "hipL": [
       0,
       -0.05,
       -0.08
      ],
      "hipR": [
       0,
       -0.05,
       -0.08
      ],
      "hipC": [
       0,
       -0.05,
       -0.08
      ],
      "kneeL": [
       0,
       0.67,
       0.04
      ],
      "kneeR": [
       0,
       0.67,
       0.04
      ],
      "ankL": [
       0,
       0.66,
       0
      ],
      "ankR": [
       0,
       0.66,
       0
      ],
      "neck": [
       0,
       -0.12,
       0.1
      ],
      "head": [
       0,
       -0.14,
       0.15
      ],
      "shL": [
       0,
       -0.11,
       0.1
      ],
      "shR": [
       0,
       -0.11,
       0.1
      ],
      "elbL": [
       0.03,
       -0.06,
       0.12
      ],
      "elbR": [
       -0.03,
       -0.06,
       0.12
      ],
      "hanL": [
       0.14,
       0.06,
       -0.04
      ],
      "hanR": [
       -0.14,
       0.06,
       -0.04
      ],
      "poleL": [
       0.02,
       0.45,
       -0.45
      ],
      "poleR": [
       -0.02,
       0.45,
       -0.45
      ],
      "skiLt": [
       0,
       0.66,
       0
      ],
      "skiLn": [
       0,
       0.66,
       0
      ],
      "skiRt": [
       0,
       0.66,
       0
      ],
      "skiRn": [
       0,
       0.66,
       0
      ]
     }
    }
   },
   "board": {
    "ride": {
     "label": "Ride",
     "roll": 0,
     "lift": 0,
     "move": {}
    },
    "carveToe": {
     "label": "Carve toe side",
     "roll": -18,
     "lift": 0,
     "move": {
      "kneeF": [
       0.04,
       -0.04,
       0
      ],
      "kneeB": [
       0.04,
       -0.04,
       0
      ],
      "hipF": [
       0,
       -0.05,
       0
      ],
      "hipB": [
       0,
       -0.05,
       0
      ],
      "hipC": [
       0,
       -0.05,
       0
      ]
     }
    },
    "carveHeel": {
     "label": "Carve heel side",
     "roll": 18,
     "lift": 0,
     "move": {
      "hipF": [
       -0.08,
       -0.06,
       0
      ],
      "hipB": [
       -0.08,
       -0.06,
       0
      ],
      "hipC": [
       -0.08,
       -0.06,
       0
      ],
      "kneeF": [
       0.02,
       -0.02,
       0
      ],
      "kneeB": [
       0.02,
       -0.02,
       0
      ]
     }
    },
    "crouch": {
     "label": "Crouch / brake / approach",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipF": [
       0,
       -0.18,
       0
      ],
      "hipB": [
       0,
       -0.18,
       0
      ],
      "hipC": [
       0,
       -0.18,
       0
      ],
      "kneeF": [
       0.06,
       -0.08,
       0
      ],
      "kneeB": [
       0.06,
       -0.08,
       0
      ],
      "neck": [
       0.06,
       -0.22,
       0
      ],
      "head": [
       0.06,
       -0.22,
       0
      ],
      "shF": [
       0.06,
       -0.22,
       0
      ],
      "shB": [
       0.06,
       -0.22,
       0
      ],
      "elbF": [
       0.06,
       -0.18,
       0
      ],
      "elbB": [
       0.06,
       -0.18,
       0
      ],
      "hanF": [
       0.06,
       -0.18,
       0
      ],
      "hanB": [
       0.06,
       -0.18,
       0
      ]
     }
    },
    "air": {
     "label": "Air (grab)",
     "roll": 0,
     "lift": 0.5,
     "move": {
      "ankF": [
       0,
       0.22,
       0
      ],
      "ankB": [
       0,
       0.22,
       0
      ],
      "tail": [
       0,
       0.22,
       0
      ],
      "nose": [
       0,
       0.22,
       0
      ],
      "kneeF": [
       0.08,
       0.14,
       0
      ],
      "kneeB": [
       0.08,
       0.14,
       0
      ],
      "elbB": [
       0.06,
       -0.27,
       0.14
      ],
      "hanB": [
       -0.06,
       -0.41,
       0.43
      ],
      "elbF": [
       0,
       0.1,
       0.04
      ],
      "hanF": [
       0.04,
       0.15,
       0.08
      ]
     }
    },
    "land": {
     "label": "Landing (compression)",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipF": [
       0,
       -0.26,
       0
      ],
      "hipB": [
       0,
       -0.26,
       0
      ],
      "hipC": [
       0,
       -0.26,
       0
      ],
      "kneeF": [
       0.09,
       -0.12,
       0
      ],
      "kneeB": [
       0.09,
       -0.12,
       0
      ],
      "neck": [
       0.1,
       -0.3,
       0
      ],
      "head": [
       0.1,
       -0.3,
       0
      ],
      "shF": [
       0.1,
       -0.3,
       0
      ],
      "shB": [
       0.1,
       -0.3,
       0
      ],
      "elbF": [
       0.1,
       -0.24,
       0
      ],
      "elbB": [
       0.1,
       -0.24,
       0
      ],
      "hanF": [
       0.12,
       -0.26,
       0.06
      ],
      "hanB": [
       0.12,
       -0.26,
       -0.06
      ]
     }
    },
    "grind": {
     "label": "Grind (50-50)",
     "roll": 0,
     "lift": 0,
     "move": {
      "hipF": [
       0,
       -0.06,
       0
      ],
      "hipB": [
       0,
       -0.06,
       0
      ],
      "hipC": [
       0,
       -0.06,
       0
      ],
      "elbF": [
       0,
       0.1,
       0.06
      ],
      "hanF": [
       0,
       0.25,
       0.14
      ],
      "elbB": [
       0,
       0.1,
       -0.06
      ],
      "hanB": [
       0,
       0.25,
       -0.12
      ]
     }
    },
    "wipeout": {
     "label": "Wipeout",
     "roll": 75,
     "lift": 0,
     "move": {
      "elbF": [
       -0.1,
       0.2,
       0
      ],
      "hanF": [
       -0.15,
       0.45,
       0.1
      ],
      "elbB": [
       -0.1,
       0.2,
       0
      ],
      "hanB": [
       -0.2,
       0.4,
       -0.1
      ]
     }
    },
    "brakeHeel": {
     "label": "Brake, heel-side skid",
     "roll": 22,
     "lift": 0,
     "twistDeg": 0,
     "headYawDeg": 0,
     "move": {
      "hipF": [
       -0.1,
       -0.2,
       0
      ],
      "hipB": [
       -0.1,
       -0.2,
       0
      ],
      "hipC": [
       -0.1,
       -0.2,
       0
      ],
      "kneeF": [
       0.04,
       -0.1,
       0
      ],
      "kneeB": [
       0.04,
       -0.1,
       0
      ],
      "neck": [
       -0.04,
       -0.2,
       0
      ],
      "head": [
       -0.04,
       -0.2,
       0
      ],
      "shF": [
       -0.04,
       -0.2,
       0
      ],
      "shB": [
       -0.04,
       -0.2,
       0
      ],
      "elbF": [
       0.04,
       -0.16,
       0
      ],
      "elbB": [
       0.04,
       -0.16,
       0
      ],
      "hanF": [
       0.1,
       -0.14,
       0
      ],
      "hanB": [
       0.1,
       -0.14,
       0
      ]
     }
    },
    "brakeToe": {
     "label": "Brake, toe-side skid",
     "roll": -20,
     "lift": 0,
     "twistDeg": 0,
     "headYawDeg": -45,
     "move": {
      "hipF": [
       0.06,
       -0.16,
       0
      ],
      "hipB": [
       0.06,
       -0.16,
       0
      ],
      "hipC": [
       0.06,
       -0.16,
       0
      ],
      "kneeF": [
       0.1,
       -0.1,
       0
      ],
      "kneeB": [
       0.1,
       -0.1,
       0
      ],
      "neck": [
       0.1,
       -0.16,
       0
      ],
      "head": [
       0.1,
       -0.16,
       0
      ],
      "shF": [
       0.1,
       -0.16,
       0
      ],
      "shB": [
       0.1,
       -0.16,
       0
      ],
      "elbF": [
       0.08,
       -0.1,
       0
      ],
      "elbB": [
       0.08,
       -0.1,
       0
      ],
      "hanF": [
       0.08,
       -0.06,
       0
      ],
      "hanB": [
       0.08,
       -0.06,
       0
      ]
     }
    },
    "tuck": {
     "label": "Flip tuck",
     "roll": 0,
     "lift": 0.5,
     "move": {
      "hipF": [
       -0.06,
       -0.04,
       0
      ],
      "hipB": [
       -0.06,
       -0.04,
       0
      ],
      "hipC": [
       -0.06,
       -0.04,
       0
      ],
      "kneeF": [
       0.17,
       0.58,
       0
      ],
      "kneeB": [
       0.17,
       0.58,
       0
      ],
      "ankF": [
       0.05,
       0.62,
       0
      ],
      "ankB": [
       0.05,
       0.62,
       0
      ],
      "neck": [
       0.16,
       -0.1,
       0
      ],
      "head": [
       0.2,
       -0.13,
       0
      ],
      "shF": [
       0.15,
       -0.1,
       0
      ],
      "shB": [
       0.15,
       -0.1,
       0
      ],
      "elbF": [
       0.24,
       -0.03,
       -0.08
      ],
      "elbB": [
       0.22,
       -0.04,
       0.08
      ],
      "hanF": [
       0.28,
       -0.1,
       -0.34
      ],
      "hanB": [
       0.22,
       -0.1,
       0.28
      ],
      "tail": [
       0.05,
       0.62,
       0
      ],
      "nose": [
       0.05,
       0.62,
       0
      ]
     }
    }
   }
  },
  "poseOrder": {
   "ski": [
    "ride",
    "carveL",
    "carveR",
    "crouch",
    "air",
    "land",
    "grind",
    "wipeout",
    "brakeL",
    "brakeR",
    "switchL",
    "switchR",
    "tuck"
   ],
   "board": [
    "ride",
    "carveToe",
    "carveHeel",
    "crouch",
    "air",
    "land",
    "grind",
    "wipeout",
    "brakeHeel",
    "brakeToe",
    "tuck"
   ]
  },
  "timing": {
   "defaultBlend": 0.12,
   "into": {
    "air": 0.08,
    "land": 0.04,
    "wipeout": 0,
    "grind": 0.06,
    "brakeL": 0.1,
    "brakeR": 0.1,
    "brakeHeel": 0.1,
    "brakeToe": 0.1,
    "switchL": 0.25,
    "switchR": 0.25,
    "tuck": 0.1
   },
   "hold": {
    "land": 0.22
   },
   "after": {
    "land": "ride",
    "tuck": "air"
   },
   "spin": "Spinning in the air reuses the air pose. Only yaw changes, taken from the accumulated rot.",
   "grind": "One grind pose (50-50) for both rails and boxes.",
   "note": "\"land\" is entered on touchdown, held for 0.22 s, then blended to the riding pose over defaultBlend. Wipeout snaps in with no blend.",
   "brake": "v1.4. A brake pose blends in over 0.1 s, a little faster than defaultBlend, so a stop reads at once. Its twistDeg and headYawDeg blend over the same time as the joints.",
   "switch": "v1.4. Turning round to ski switch blends over 0.25 s: the shoulders open and the head comes round together. Going back to ride uses defaultBlend.",
   "tuck": "v1.4. The flip tuck blends in over 0.1 s once the flip starts and goes back to air (timing.after.tuck) when the flip ends, over defaultBlend. bodyPitchDeg is never blended: it is the flip angle from the simulation, every frame.",
   "angles": "Blend a pose's twistDeg and headYawDeg as angles, the short way round, over the same time as its joints. A pose without them counts as 0."
  },
  "rotations": {
   "units": "degrees",
   "sign": "Yaw-type angles (twistDeg, headYawDeg) are clockwise seen from above, the same sense as compass headings and as projectRider's yaw: + turns toward the rider's right (+x in rider space).",
   "order": "projectRider builds the pose joints (with the goofy mirror), then turns the lower body by twist about the vertical axis through the rider-space origin, turns the head and face vector by head yaw about the vertical axis through the neck, then flips the whole rider by bodyPitch about the rider's own left-right axis through hipC (bodyPitch.axis). After that comes the v1.3 projection: pose roll plus rollExtra, lift, yaw, camera pitch.",
   "twist": {
    "lower": {
     "ski": [
      "ankL",
      "ankR",
      "kneeL",
      "kneeR",
      "hipL",
      "hipR",
      "skiLt",
      "skiLn",
      "skiRt",
      "skiRn"
     ],
     "board": [
      "ankF",
      "ankB",
      "kneeF",
      "kneeB",
      "hipF",
      "hipB",
      "tail",
      "nose"
     ]
    },
    "pivot": "The vertical axis through the rider-space origin, the feet's ground point, so the skis or board turn under the rider and the shadow stays put.",
    "meaning": "How far the legs, boots and equipment are turned relative to the upper body. hipC, the torso, arms, poles and head stay with the upper body. With a twist, projectRider's yaw is the upper body's heading (rider-space +z) and the equipment's heading is yaw + twist. With twist 0 they are the same, as in v1.3.",
    "goofy": "Given in the regular-stance frame and mirrored with the joints, so the same value turns a goofy board the same way relative to its nose.",
    "rangeDeg": [
     -100,
     100
    ],
    "note": "F5: braking turns the equipment, not the rider. A hockey stop is about 80 deg with the upper body still facing down the fall line; carving counter-rotation is 5 to 20 deg."
   },
   "headYaw": {
    "group": [
     "head"
    ],
    "pivot": "The vertical axis through the neck. The face vector (rider.face) turns with the head, so the goggles follow it.",
    "meaning": "How far the head is turned relative to the shoulders.",
    "goofy": "Mirrored with the joints, like twist.",
    "rangeDeg": [
     -110,
     110
    ],
    "fakieDeg": [
     80,
     100
    ],
    "note": "F7: riding ski switch, look 80 to 100 deg over the downhill-side shoulder (+ for the right shoulder)."
   },
   "bodyPitch": {
    "pivot": "The rider's own left-right axis through the posed hipC, as in a somersault (axis).",
    "axis": {
     "ski": "x",
     "board": "z"
    },
    "meaning": "Flip rotation of the whole rider, equipment included. + is a front flip (chest and face first), - a backflip (back first). Skis: about rider-space x, the head goes toward +z (the heading). Board: the rider stands sideways, so the axis is the board's long axis (rider-space z) and the head goes toward +x, the toe edge and chest. Goofy riders also face +x, so the sign is the same in both stances.",
    "wrap": "Taken modulo 360, so 360 draws exactly like 0.",
  "equipInFront": {
   "fromDeg": 45,
   "toDeg": 315,
   "marginM": 0.1,
   "note": "The draw list normally puts the equipment under the body. While the body pitch is between fromDeg and toDeg and a ski or the board is more than marginM nearer the camera than the torso, that piece is drawn after the body instead, so the bases of the skis or board cover the rider in a flip."
  },
    "note": "F3: pass the simulation's flip angle every frame, with the tuck pose while flipping. The shadow does not pitch."
   },
   "cameraPitch": {
    "meaning": "How far the camera looks down at the rider below the horizontal, in degrees, + = down. Pass the pitch the terrain is actually drawn with this frame, slope tilt included, so the rider and the ground are seen from the same angle (F1).",
    "default": "camera.chasePitchDeg (20), the v1.3 fixed value, when neither the pitch argument nor options.cameraPitchDeg is given."
   },
   "lean": "F6 conventions for RiderAnim (no pose needed): lean is roll about rider-space z through the feet, + toward the rider's -x (so leaning to the right of travel is -lean x riderSide); edge-driven lean takes its target from the edge angle and carve rate, and angulation keeps the upper body nearer upright. Unweighting is a joint offset (hips and upper body rise, then drop) on top of the blended pose, not a pose. Counter-rotation is twist; it never replaces lean.",
   "defaults": "A pose may carry twistDeg and headYawDeg (the v1.4 brake, switch poses). options.twistDeg and options.headYawDeg replace the pose's values when given; they do not add to them. bodyPitchDeg and cameraPitchDeg come only from options."
  },
  "scale": {
   "drawScale": 1,
   "note": "v1.4 (F1). Draw the rider at true scale: 1.76 m tall with the same pixels per metre as the ground it stands on at its distance from the camera, and with the camera's real pitch (rotations.cameraPitch). Framing the rider (how big it looks on screen) is the camera's job: distance, height and field of view. v1.3 games drew it at 0.55 of true size (RSC); set that to 1 and move the camera instead."
  },
  "stance": {
   "options": [
    "regular",
    "goofy"
   ],
   "default": "regular",
   "storageKey": "gresca-stance",
   "goofy": "Mirror the snowboarder's joints and face vector in z (z → −z) before projecting. Toe and heel stay the same edges. v1.4: twistDeg and headYawDeg are mirrored with the joints (rotations.twist.goofy).",
   "menu": "Shown only when Snowboard is picked: a Regular / Goofy segmented control under the picker."
  },
  "equipment": {
   "ski": {
    "params": {
     "length": 1.84,
     "tailW": 0.125,
     "waistW": 0.098,
     "noseW": 0.13,
     "waistAt": 0.5,
     "contactTail": 0.1,
     "contactNose": 0.9,
     "kick": 0.15,
     "tailRise": 0.075,
     "noseRise": 0.08,
     "round": 2.0,
     "thickness": 0.018
    },
    "attach": {
     "skiL": [
      "skiLt",
      "skiLn"
     ],
     "skiR": [
      "skiRt",
      "skiRn"
     ]
    },
    "shapes": [
     {
      "id": "edge",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.057
       ],
       [
        0.0031,
        -0.0155,
        0.0539
       ],
       [
        0.0125,
        -0.0303,
        0.045
       ],
       [
        0.0281,
        -0.0434,
        0.0316
       ],
       [
        0.0495,
        -0.054,
        0.0157
       ],
       [
        0.0766,
        -0.0608,
        -0.0001
       ],
       [
        0.1091,
        -0.0619,
        -0.0124
       ],
       [
        0.1464,
        -0.0595,
        -0.018
       ],
       [
        0.1883,
        -0.0572,
        -0.018
       ],
       [
        0.234,
        -0.055,
        -0.018
       ],
       [
        0.2831,
        -0.053,
        -0.018
       ],
       [
        0.3349,
        -0.0513,
        -0.018
       ],
       [
        0.3887,
        -0.05,
        -0.018
       ],
       [
        0.444,
        -0.0493,
        -0.018
       ],
       [
        0.5,
        -0.049,
        -0.018
       ],
       [
        0.556,
        -0.0493,
        -0.018
       ],
       [
        0.6113,
        -0.0502,
        -0.018
       ],
       [
        0.6651,
        -0.0517,
        -0.018
       ],
       [
        0.7169,
        -0.0537,
        -0.018
       ],
       [
        0.766,
        -0.0561,
        -0.018
       ],
       [
        0.8117,
        -0.0587,
        -0.018
       ],
       [
        0.8536,
        -0.0615,
        -0.018
       ],
       [
        0.8909,
        -0.0643,
        -0.012
       ],
       [
        0.9234,
        -0.0632,
        0.0011
       ],
       [
        0.9505,
        -0.0561,
        0.0179
       ],
       [
        0.9719,
        -0.0451,
        0.0349
       ],
       [
        0.9875,
        -0.0315,
        0.0492
       ],
       [
        0.9969,
        -0.0162,
        0.0587
       ],
       [
        1.0,
        -0.0,
        0.062
       ],
       [
        0.9969,
        0.0162,
        0.0587
       ],
       [
        0.9875,
        0.0315,
        0.0492
       ],
       [
        0.9719,
        0.0451,
        0.0349
       ],
       [
        0.9505,
        0.0561,
        0.0179
       ],
       [
        0.9234,
        0.0632,
        0.0011
       ],
       [
        0.8909,
        0.0643,
        -0.012
       ],
       [
        0.8536,
        0.0615,
        -0.018
       ],
       [
        0.8117,
        0.0587,
        -0.018
       ],
       [
        0.766,
        0.0561,
        -0.018
       ],
       [
        0.7169,
        0.0537,
        -0.018
       ],
       [
        0.6651,
        0.0517,
        -0.018
       ],
       [
        0.6113,
        0.0502,
        -0.018
       ],
       [
        0.556,
        0.0493,
        -0.018
       ],
       [
        0.5,
        0.049,
        -0.018
       ],
       [
        0.444,
        0.0493,
        -0.018
       ],
       [
        0.3887,
        0.05,
        -0.018
       ],
       [
        0.3349,
        0.0513,
        -0.018
       ],
       [
        0.2831,
        0.053,
        -0.018
       ],
       [
        0.234,
        0.055,
        -0.018
       ],
       [
        0.1883,
        0.0572,
        -0.018
       ],
       [
        0.1464,
        0.0595,
        -0.018
       ],
       [
        0.1091,
        0.0619,
        -0.0124
       ],
       [
        0.0766,
        0.0608,
        -0.0001
       ],
       [
        0.0495,
        0.054,
        0.0157
       ],
       [
        0.0281,
        0.0434,
        0.0316
       ],
       [
        0.0125,
        0.0303,
        0.045
       ],
       [
        0.0031,
        0.0155,
        0.0539
       ]
      ],
      "colour": "key",
      "keyline": false
     },
     {
      "id": "top",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.075
       ],
       [
        0.0031,
        -0.0155,
        0.0719
       ],
       [
        0.0125,
        -0.0303,
        0.063
       ],
       [
        0.0281,
        -0.0434,
        0.0496
       ],
       [
        0.0495,
        -0.054,
        0.0337
       ],
       [
        0.0766,
        -0.0608,
        0.0179
       ],
       [
        0.1091,
        -0.0619,
        0.0056
       ],
       [
        0.1464,
        -0.0595,
        0.0
       ],
       [
        0.1883,
        -0.0572,
        0.0
       ],
       [
        0.234,
        -0.055,
        0.0
       ],
       [
        0.2831,
        -0.053,
        0.0
       ],
       [
        0.3349,
        -0.0513,
        0.0
       ],
       [
        0.3887,
        -0.05,
        0.0
       ],
       [
        0.444,
        -0.0493,
        0.0
       ],
       [
        0.5,
        -0.049,
        0.0
       ],
       [
        0.556,
        -0.0493,
        0.0
       ],
       [
        0.6113,
        -0.0502,
        0.0
       ],
       [
        0.6651,
        -0.0517,
        0.0
       ],
       [
        0.7169,
        -0.0537,
        0.0
       ],
       [
        0.766,
        -0.0561,
        0.0
       ],
       [
        0.8117,
        -0.0587,
        0.0
       ],
       [
        0.8536,
        -0.0615,
        0.0
       ],
       [
        0.8909,
        -0.0643,
        0.006
       ],
       [
        0.9234,
        -0.0632,
        0.0191
       ],
       [
        0.9505,
        -0.0561,
        0.0359
       ],
       [
        0.9719,
        -0.0451,
        0.0529
       ],
       [
        0.9875,
        -0.0315,
        0.0672
       ],
       [
        0.9969,
        -0.0162,
        0.0767
       ],
       [
        1.0,
        -0.0,
        0.08
       ],
       [
        0.9969,
        0.0162,
        0.0767
       ],
       [
        0.9875,
        0.0315,
        0.0672
       ],
       [
        0.9719,
        0.0451,
        0.0529
       ],
       [
        0.9505,
        0.0561,
        0.0359
       ],
       [
        0.9234,
        0.0632,
        0.0191
       ],
       [
        0.8909,
        0.0643,
        0.006
       ],
       [
        0.8536,
        0.0615,
        0.0
       ],
       [
        0.8117,
        0.0587,
        0.0
       ],
       [
        0.766,
        0.0561,
        0.0
       ],
       [
        0.7169,
        0.0537,
        0.0
       ],
       [
        0.6651,
        0.0517,
        0.0
       ],
       [
        0.6113,
        0.0502,
        0.0
       ],
       [
        0.556,
        0.0493,
        0.0
       ],
       [
        0.5,
        0.049,
        0.0
       ],
       [
        0.444,
        0.0493,
        0.0
       ],
       [
        0.3887,
        0.05,
        0.0
       ],
       [
        0.3349,
        0.0513,
        0.0
       ],
       [
        0.2831,
        0.053,
        0.0
       ],
       [
        0.234,
        0.055,
        0.0
       ],
       [
        0.1883,
        0.0572,
        0.0
       ],
       [
        0.1464,
        0.0595,
        0.0
       ],
       [
        0.1091,
        0.0619,
        0.0056
       ],
       [
        0.0766,
        0.0608,
        0.0179
       ],
       [
        0.0495,
        0.054,
        0.0337
       ],
       [
        0.0281,
        0.0434,
        0.0496
       ],
       [
        0.0125,
        0.0303,
        0.063
       ],
       [
        0.0031,
        0.0155,
        0.0719
       ]
      ],
      "colour": "equip",
      "keyline": true
     },
     {
      "id": "tailCap",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.075
       ],
       [
        0.0015,
        -0.0109,
        0.0735
       ],
       [
        0.0062,
        -0.0216,
        0.069
       ],
       [
        0.0138,
        -0.0317,
        0.0618
       ],
       [
        0.0245,
        -0.041,
        0.0525
       ],
       [
        0.0381,
        -0.0491,
        0.0418
       ],
       [
        0.0545,
        -0.0557,
        0.0304
       ],
       [
        0.0737,
        -0.0603,
        0.0194
       ],
       [
        0.0955,
        -0.0624,
        0.0099
       ],
       [
        0.1198,
        -0.0612,
        0.003
       ],
       [
        0.12,
        -0.0612,
        0.003
       ],
       [
        0.1257,
        -0.0561,
        0.002
       ],
       [
        0.131,
        -0.051,
        0.0012
       ],
       [
        0.1356,
        -0.0459,
        0.0007
       ],
       [
        0.1391,
        -0.0408,
        0.0004
       ],
       [
        0.1413,
        -0.0357,
        0.0003
       ],
       [
        0.142,
        -0.0306,
        0.0002
       ],
       [
        0.1413,
        -0.0255,
        0.0003
       ],
       [
        0.1391,
        -0.0204,
        0.0004
       ],
       [
        0.1356,
        -0.0153,
        0.0007
       ],
       [
        0.131,
        -0.0102,
        0.0012
       ],
       [
        0.1257,
        -0.0051,
        0.002
       ],
       [
        0.12,
        0.0,
        0.003
       ],
       [
        0.1257,
        0.0051,
        0.002
       ],
       [
        0.131,
        0.0102,
        0.0012
       ],
       [
        0.1356,
        0.0153,
        0.0007
       ],
       [
        0.1391,
        0.0204,
        0.0004
       ],
       [
        0.1413,
        0.0255,
        0.0003
       ],
       [
        0.142,
        0.0306,
        0.0002
       ],
       [
        0.1413,
        0.0357,
        0.0003
       ],
       [
        0.1391,
        0.0408,
        0.0004
       ],
       [
        0.1356,
        0.0459,
        0.0007
       ],
       [
        0.131,
        0.051,
        0.0012
       ],
       [
        0.1257,
        0.0561,
        0.002
       ],
       [
        0.12,
        0.0612,
        0.003
       ],
       [
        0.1198,
        0.0612,
        0.003
       ],
       [
        0.0955,
        0.0624,
        0.0099
       ],
       [
        0.0737,
        0.0603,
        0.0194
       ],
       [
        0.0545,
        0.0557,
        0.0304
       ],
       [
        0.0381,
        0.0491,
        0.0418
       ],
       [
        0.0245,
        0.041,
        0.0525
       ],
       [
        0.0138,
        0.0317,
        0.0618
       ],
       [
        0.0062,
        0.0216,
        0.069
       ],
       [
        0.0015,
        0.0109,
        0.0735
       ],
       [
        0.0,
        0.0,
        0.075
       ]
      ],
      "colour": "equipAccent",
      "keyline": false
     },
     {
      "id": "noseCap",
      "kind": "poly",
      "pts": [
       [
        0.87,
        -0.0627,
        0.0014
       ],
       [
        0.8638,
        -0.0575,
        0.0007
       ],
       [
        0.858,
        -0.0522,
        0.0002
       ],
       [
        0.853,
        -0.047,
        0.0
       ],
       [
        0.8492,
        -0.0418,
        0.0
       ],
       [
        0.8468,
        -0.0366,
        0.0
       ],
       [
        0.846,
        -0.0313,
        0.0
       ],
       [
        0.8468,
        -0.0261,
        0.0
       ],
       [
        0.8492,
        -0.0209,
        0.0
       ],
       [
        0.853,
        -0.0157,
        0.0
       ],
       [
        0.858,
        -0.0104,
        0.0002
       ],
       [
        0.8638,
        -0.0052,
        0.0007
       ],
       [
        0.87,
        0.0,
        0.0014
       ],
       [
        0.8638,
        0.0052,
        0.0007
       ],
       [
        0.858,
        0.0104,
        0.0002
       ],
       [
        0.853,
        0.0157,
        0.0
       ],
       [
        0.8492,
        0.0209,
        0.0
       ],
       [
        0.8468,
        0.0261,
        0.0
       ],
       [
        0.846,
        0.0313,
        0.0
       ],
       [
        0.8468,
        0.0366,
        0.0
       ],
       [
        0.8492,
        0.0418,
        0.0
       ],
       [
        0.853,
        0.047,
        0.0
       ],
       [
        0.858,
        0.0522,
        0.0002
       ],
       [
        0.8638,
        0.0575,
        0.0007
       ],
       [
        0.87,
        0.0627,
        0.0014
       ],
       [
        0.9045,
        0.0649,
        0.0106
       ],
       [
        0.9263,
        0.0627,
        0.0207
       ],
       [
        0.9455,
        0.0579,
        0.0324
       ],
       [
        0.9619,
        0.051,
        0.0446
       ],
       [
        0.9755,
        0.0426,
        0.056
       ],
       [
        0.9862,
        0.033,
        0.0659
       ],
       [
        0.9938,
        0.0225,
        0.0736
       ],
       [
        0.9985,
        0.0114,
        0.0784
       ],
       [
        1.0,
        0.0,
        0.08
       ],
       [
        0.9985,
        -0.0114,
        0.0784
       ],
       [
        0.9938,
        -0.0225,
        0.0736
       ],
       [
        0.9862,
        -0.033,
        0.0659
       ],
       [
        0.9755,
        -0.0426,
        0.056
       ],
       [
        0.9619,
        -0.051,
        0.0446
       ],
       [
        0.9455,
        -0.0579,
        0.0324
       ],
       [
        0.9263,
        -0.0627,
        0.0207
       ],
       [
        0.9045,
        -0.0649,
        0.0106
       ]
      ],
      "colour": "equipAccent",
      "keyline": false
     },
     {
      "id": "pinline",
      "kind": "line",
      "pts": [
       [
        0.17,
        0,
        0
       ],
       [
        0.42,
        0,
        0
       ]
      ],
      "width": 0.012,
      "colour": "paper"
     },
     {
      "id": "pinline2",
      "kind": "line",
      "pts": [
       [
        0.58,
        0,
        0
       ],
       [
        0.8,
        0,
        0
       ]
      ],
      "width": 0.012,
      "colour": "paper"
     },
     {
      "id": "sun",
      "kind": "poly",
      "pts": [
       [
        0.7352,
        0.0,
        0.0
       ],
       [
        0.7341,
        0.0107,
        0.0
       ],
       [
        0.7308,
        0.0198,
        0.0
       ],
       [
        0.7258,
        0.0259,
        0.0
       ],
       [
        0.72,
        0.028,
        0.0
       ],
       [
        0.7142,
        0.0259,
        0.0
       ],
       [
        0.7092,
        0.0198,
        0.0
       ],
       [
        0.7059,
        0.0107,
        0.0
       ],
       [
        0.7048,
        0.0,
        0.0
       ],
       [
        0.7059,
        -0.0107,
        0.0
       ],
       [
        0.7092,
        -0.0198,
        0.0
       ],
       [
        0.7142,
        -0.0259,
        0.0
       ],
       [
        0.72,
        -0.028,
        0.0
       ],
       [
        0.7258,
        -0.0259,
        0.0
       ],
       [
        0.7308,
        -0.0198,
        0.0
       ],
       [
        0.7341,
        -0.0107,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "toe",
      "kind": "poly",
      "pts": [
       [
        0.53,
        -0.035,
        0.025
       ],
       [
        0.6,
        -0.035,
        0.025
       ],
       [
        0.6,
        0.035,
        0.025
       ],
       [
        0.53,
        0.035,
        0.025
       ]
      ],
      "colour": "paperS",
      "keyline": true
     },
     {
      "id": "heel",
      "kind": "poly",
      "pts": [
       [
        0.4,
        -0.035,
        0.025
       ],
       [
        0.46,
        -0.035,
        0.025
       ],
       [
        0.46,
        0.035,
        0.025
       ],
       [
        0.4,
        0.035,
        0.025
       ]
      ],
      "colour": "paperS",
      "keyline": true
     }
    ],
    "note": "Freestyle twin tip: 1.84 m, 130 / 98 / 125 mm (nose / waist / tail), both ends turned up 75–80 mm over the last 15%. Vermilion topsheet (the same family as the board), paper caps with a two-scallop wave edge, a paper pinline and a small indigo sun ahead of the binding. From the chase camera the tails are what shows, so they carry the brightest contrast against the indigo boots and the snow."
   },
   "board": {
    "params": {
     "length": 1.58,
     "tailW": 0.292,
     "waistW": 0.25,
     "noseW": 0.292,
     "waistAt": 0.5,
     "contactTail": 0.11,
     "contactNose": 0.89,
     "kick": 0.12,
     "tailRise": 0.06,
     "noseRise": 0.06,
     "round": 3.2,
     "thickness": 0.02
    },
    "attach": {
     "board": [
      "tail",
      "nose"
     ]
    },
    "shapes": [
     {
      "id": "edge",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.04
       ],
       [
        0.0031,
        -0.0685,
        0.0369
       ],
       [
        0.0125,
        -0.1024,
        0.0281
       ],
       [
        0.0281,
        -0.1251,
        0.0152
       ],
       [
        0.0495,
        -0.1389,
        0.0007
       ],
       [
        0.0766,
        -0.145,
        -0.0122
       ],
       [
        0.1091,
        -0.146,
        -0.0195
       ],
       [
        0.1464,
        -0.1423,
        -0.02
       ],
       [
        0.1883,
        -0.1384,
        -0.02
       ],
       [
        0.234,
        -0.1348,
        -0.02
       ],
       [
        0.2831,
        -0.1315,
        -0.02
       ],
       [
        0.3349,
        -0.1288,
        -0.02
       ],
       [
        0.3887,
        -0.1267,
        -0.02
       ],
       [
        0.444,
        -0.1254,
        -0.02
       ],
       [
        0.5,
        -0.125,
        -0.02
       ],
       [
        0.556,
        -0.1254,
        -0.02
       ],
       [
        0.6113,
        -0.1267,
        -0.02
       ],
       [
        0.6651,
        -0.1288,
        -0.02
       ],
       [
        0.7169,
        -0.1315,
        -0.02
       ],
       [
        0.766,
        -0.1348,
        -0.02
       ],
       [
        0.8117,
        -0.1384,
        -0.02
       ],
       [
        0.8536,
        -0.1423,
        -0.02
       ],
       [
        0.8909,
        -0.146,
        -0.0195
       ],
       [
        0.9234,
        -0.145,
        -0.0122
       ],
       [
        0.9505,
        -0.1389,
        0.0007
       ],
       [
        0.9719,
        -0.1251,
        0.0152
       ],
       [
        0.9875,
        -0.1024,
        0.0281
       ],
       [
        0.9969,
        -0.0685,
        0.0369
       ],
       [
        1.0,
        -0.0,
        0.04
       ],
       [
        0.9969,
        0.0685,
        0.0369
       ],
       [
        0.9875,
        0.1024,
        0.0281
       ],
       [
        0.9719,
        0.1251,
        0.0152
       ],
       [
        0.9505,
        0.1389,
        0.0007
       ],
       [
        0.9234,
        0.145,
        -0.0122
       ],
       [
        0.8909,
        0.146,
        -0.0195
       ],
       [
        0.8536,
        0.1423,
        -0.02
       ],
       [
        0.8117,
        0.1384,
        -0.02
       ],
       [
        0.766,
        0.1348,
        -0.02
       ],
       [
        0.7169,
        0.1315,
        -0.02
       ],
       [
        0.6651,
        0.1288,
        -0.02
       ],
       [
        0.6113,
        0.1267,
        -0.02
       ],
       [
        0.556,
        0.1254,
        -0.02
       ],
       [
        0.5,
        0.125,
        -0.02
       ],
       [
        0.444,
        0.1254,
        -0.02
       ],
       [
        0.3887,
        0.1267,
        -0.02
       ],
       [
        0.3349,
        0.1288,
        -0.02
       ],
       [
        0.2831,
        0.1315,
        -0.02
       ],
       [
        0.234,
        0.1348,
        -0.02
       ],
       [
        0.1883,
        0.1384,
        -0.02
       ],
       [
        0.1464,
        0.1423,
        -0.02
       ],
       [
        0.1091,
        0.146,
        -0.0195
       ],
       [
        0.0766,
        0.145,
        -0.0122
       ],
       [
        0.0495,
        0.1389,
        0.0007
       ],
       [
        0.0281,
        0.1251,
        0.0152
       ],
       [
        0.0125,
        0.1024,
        0.0281
       ],
       [
        0.0031,
        0.0685,
        0.0369
       ]
      ],
      "colour": "key",
      "keyline": false
     },
     {
      "id": "top",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.06
       ],
       [
        0.0031,
        -0.0685,
        0.0569
       ],
       [
        0.0125,
        -0.1024,
        0.0481
       ],
       [
        0.0281,
        -0.1251,
        0.0352
       ],
       [
        0.0495,
        -0.1389,
        0.0207
       ],
       [
        0.0766,
        -0.145,
        0.0078
       ],
       [
        0.1091,
        -0.146,
        0.0005
       ],
       [
        0.1464,
        -0.1423,
        0.0
       ],
       [
        0.1883,
        -0.1384,
        0.0
       ],
       [
        0.234,
        -0.1348,
        0.0
       ],
       [
        0.2831,
        -0.1315,
        0.0
       ],
       [
        0.3349,
        -0.1288,
        0.0
       ],
       [
        0.3887,
        -0.1267,
        0.0
       ],
       [
        0.444,
        -0.1254,
        0.0
       ],
       [
        0.5,
        -0.125,
        0.0
       ],
       [
        0.556,
        -0.1254,
        0.0
       ],
       [
        0.6113,
        -0.1267,
        0.0
       ],
       [
        0.6651,
        -0.1288,
        0.0
       ],
       [
        0.7169,
        -0.1315,
        0.0
       ],
       [
        0.766,
        -0.1348,
        0.0
       ],
       [
        0.8117,
        -0.1384,
        0.0
       ],
       [
        0.8536,
        -0.1423,
        0.0
       ],
       [
        0.8909,
        -0.146,
        0.0005
       ],
       [
        0.9234,
        -0.145,
        0.0078
       ],
       [
        0.9505,
        -0.1389,
        0.0207
       ],
       [
        0.9719,
        -0.1251,
        0.0352
       ],
       [
        0.9875,
        -0.1024,
        0.0481
       ],
       [
        0.9969,
        -0.0685,
        0.0569
       ],
       [
        1.0,
        -0.0,
        0.06
       ],
       [
        0.9969,
        0.0685,
        0.0569
       ],
       [
        0.9875,
        0.1024,
        0.0481
       ],
       [
        0.9719,
        0.1251,
        0.0352
       ],
       [
        0.9505,
        0.1389,
        0.0207
       ],
       [
        0.9234,
        0.145,
        0.0078
       ],
       [
        0.8909,
        0.146,
        0.0005
       ],
       [
        0.8536,
        0.1423,
        0.0
       ],
       [
        0.8117,
        0.1384,
        0.0
       ],
       [
        0.766,
        0.1348,
        0.0
       ],
       [
        0.7169,
        0.1315,
        0.0
       ],
       [
        0.6651,
        0.1288,
        0.0
       ],
       [
        0.6113,
        0.1267,
        0.0
       ],
       [
        0.556,
        0.1254,
        0.0
       ],
       [
        0.5,
        0.125,
        0.0
       ],
       [
        0.444,
        0.1254,
        0.0
       ],
       [
        0.3887,
        0.1267,
        0.0
       ],
       [
        0.3349,
        0.1288,
        0.0
       ],
       [
        0.2831,
        0.1315,
        0.0
       ],
       [
        0.234,
        0.1348,
        0.0
       ],
       [
        0.1883,
        0.1384,
        0.0
       ],
       [
        0.1464,
        0.1423,
        0.0
       ],
       [
        0.1091,
        0.146,
        0.0005
       ],
       [
        0.0766,
        0.145,
        0.0078
       ],
       [
        0.0495,
        0.1389,
        0.0207
       ],
       [
        0.0281,
        0.1251,
        0.0352
       ],
       [
        0.0125,
        0.1024,
        0.0481
       ],
       [
        0.0031,
        0.0685,
        0.0569
       ]
      ],
      "colour": "equip",
      "keyline": true
     },
     {
      "id": "tailCap",
      "kind": "poly",
      "pts": [
       [
        0.0,
        -0.0,
        0.06
       ],
       [
        0.0015,
        -0.0551,
        0.0585
       ],
       [
        0.0062,
        -0.0837,
        0.054
       ],
       [
        0.0138,
        -0.1051,
        0.047
       ],
       [
        0.0245,
        -0.1213,
        0.038
       ],
       [
        0.0381,
        -0.1331,
        0.028
       ],
       [
        0.0545,
        -0.1407,
        0.0179
       ],
       [
        0.0737,
        -0.1447,
        0.0089
       ],
       [
        0.085,
        -0.1456,
        0.0051
       ],
       [
        0.0934,
        -0.1335,
        0.0029
       ],
       [
        0.1006,
        -0.1213,
        0.0016
       ],
       [
        0.1053,
        -0.1092,
        0.0009
       ],
       [
        0.107,
        -0.0971,
        0.0007
       ],
       [
        0.1053,
        -0.0849,
        0.0009
       ],
       [
        0.1006,
        -0.0728,
        0.0016
       ],
       [
        0.0934,
        -0.0607,
        0.0029
       ],
       [
        0.085,
        -0.0485,
        0.0051
       ],
       [
        0.0934,
        -0.0364,
        0.0029
       ],
       [
        0.1006,
        -0.0243,
        0.0016
       ],
       [
        0.1053,
        -0.0121,
        0.0009
       ],
       [
        0.107,
        0.0,
        0.0007
       ],
       [
        0.1053,
        0.0121,
        0.0009
       ],
       [
        0.1006,
        0.0243,
        0.0016
       ],
       [
        0.0934,
        0.0364,
        0.0029
       ],
       [
        0.085,
        0.0485,
        0.0051
       ],
       [
        0.0934,
        0.0607,
        0.0029
       ],
       [
        0.1006,
        0.0728,
        0.0016
       ],
       [
        0.1053,
        0.0849,
        0.0009
       ],
       [
        0.107,
        0.0971,
        0.0007
       ],
       [
        0.1053,
        0.1092,
        0.0009
       ],
       [
        0.1006,
        0.1213,
        0.0016
       ],
       [
        0.0934,
        0.1335,
        0.0029
       ],
       [
        0.085,
        0.1456,
        0.0051
       ],
       [
        0.0737,
        0.1447,
        0.0089
       ],
       [
        0.0545,
        0.1407,
        0.0179
       ],
       [
        0.0381,
        0.1331,
        0.028
       ],
       [
        0.0245,
        0.1213,
        0.038
       ],
       [
        0.0138,
        0.1051,
        0.047
       ],
       [
        0.0062,
        0.0837,
        0.054
       ],
       [
        0.0015,
        0.0551,
        0.0585
       ],
       [
        0.0,
        0.0,
        0.06
       ]
      ],
      "colour": "equipAccent",
      "keyline": false
     },
     {
      "id": "noseCap",
      "kind": "poly",
      "pts": [
       [
        0.915,
        -0.1456,
        0.0051
       ],
       [
        0.9066,
        -0.1335,
        0.0029
       ],
       [
        0.8994,
        -0.1213,
        0.0016
       ],
       [
        0.8947,
        -0.1092,
        0.0009
       ],
       [
        0.893,
        -0.0971,
        0.0007
       ],
       [
        0.8947,
        -0.0849,
        0.0009
       ],
       [
        0.8994,
        -0.0728,
        0.0016
       ],
       [
        0.9066,
        -0.0607,
        0.0029
       ],
       [
        0.915,
        -0.0485,
        0.0051
       ],
       [
        0.9066,
        -0.0364,
        0.0029
       ],
       [
        0.8994,
        -0.0243,
        0.0016
       ],
       [
        0.8947,
        -0.0121,
        0.0009
       ],
       [
        0.893,
        0.0,
        0.0007
       ],
       [
        0.8947,
        0.0121,
        0.0009
       ],
       [
        0.8994,
        0.0243,
        0.0016
       ],
       [
        0.9066,
        0.0364,
        0.0029
       ],
       [
        0.915,
        0.0485,
        0.0051
       ],
       [
        0.9066,
        0.0607,
        0.0029
       ],
       [
        0.8994,
        0.0728,
        0.0016
       ],
       [
        0.8947,
        0.0849,
        0.0009
       ],
       [
        0.893,
        0.0971,
        0.0007
       ],
       [
        0.8947,
        0.1092,
        0.0009
       ],
       [
        0.8994,
        0.1213,
        0.0016
       ],
       [
        0.9066,
        0.1335,
        0.0029
       ],
       [
        0.915,
        0.1456,
        0.0051
       ],
       [
        0.9455,
        0.1407,
        0.0179
       ],
       [
        0.9619,
        0.1331,
        0.028
       ],
       [
        0.9755,
        0.1213,
        0.038
       ],
       [
        0.9862,
        0.1051,
        0.047
       ],
       [
        0.9938,
        0.0837,
        0.054
       ],
       [
        0.9985,
        0.0551,
        0.0585
       ],
       [
        1.0,
        0.0,
        0.06
       ],
       [
        0.9985,
        -0.0551,
        0.0585
       ],
       [
        0.9938,
        -0.0837,
        0.054
       ],
       [
        0.9862,
        -0.1051,
        0.047
       ],
       [
        0.9755,
        -0.1213,
        0.038
       ],
       [
        0.9619,
        -0.1331,
        0.028
       ],
       [
        0.9455,
        -0.1407,
        0.0179
       ]
      ],
      "colour": "equipAccent",
      "keyline": false
     },
     {
      "id": "sun",
      "kind": "poly",
      "pts": [
       [
        0.5443,
        0.0,
        0.0
       ],
       [
        0.5421,
        0.0216,
        0.0
       ],
       [
        0.5358,
        0.0411,
        0.0
       ],
       [
        0.526,
        0.0566,
        0.0
       ],
       [
        0.5137,
        0.0666,
        0.0
       ],
       [
        0.5,
        0.07,
        0.0
       ],
       [
        0.4863,
        0.0666,
        0.0
       ],
       [
        0.474,
        0.0566,
        0.0
       ],
       [
        0.4642,
        0.0411,
        0.0
       ],
       [
        0.4579,
        0.0216,
        0.0
       ],
       [
        0.4557,
        0.0,
        0.0
       ],
       [
        0.4579,
        -0.0216,
        0.0
       ],
       [
        0.4642,
        -0.0411,
        0.0
       ],
       [
        0.474,
        -0.0566,
        0.0
       ],
       [
        0.4863,
        -0.0666,
        0.0
       ],
       [
        0.5,
        -0.07,
        0.0
       ],
       [
        0.5137,
        -0.0666,
        0.0
       ],
       [
        0.526,
        -0.0566,
        0.0
       ],
       [
        0.5358,
        -0.0411,
        0.0
       ],
       [
        0.5421,
        -0.0216,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": true
     },
     {
      "id": "ray0",
      "kind": "poly",
      "pts": [
       [
        0.5536,
        -0.0076,
        0.0
       ],
       [
        0.5747,
        0.0,
        0.0
       ],
       [
        0.5536,
        0.0076,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray1",
      "kind": "poly",
      "pts": [
       [
        0.5413,
        0.0545,
        0.0
       ],
       [
        0.5528,
        0.0834,
        0.0
       ],
       [
        0.5345,
        0.0653,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray2",
      "kind": "poly",
      "pts": [
       [
        0.5048,
        0.0847,
        0.0
       ],
       [
        0.5,
        0.118,
        0.0
       ],
       [
        0.4952,
        0.0847,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray3",
      "kind": "poly",
      "pts": [
       [
        0.4655,
        0.0653,
        0.0
       ],
       [
        0.4472,
        0.0834,
        0.0
       ],
       [
        0.4587,
        0.0545,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray4",
      "kind": "poly",
      "pts": [
       [
        0.4464,
        0.0076,
        0.0
       ],
       [
        0.4253,
        0.0,
        0.0
       ],
       [
        0.4464,
        -0.0076,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray5",
      "kind": "poly",
      "pts": [
       [
        0.4587,
        -0.0545,
        0.0
       ],
       [
        0.4472,
        -0.0834,
        0.0
       ],
       [
        0.4655,
        -0.0653,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray6",
      "kind": "poly",
      "pts": [
       [
        0.4952,
        -0.0847,
        0.0
       ],
       [
        0.5,
        -0.118,
        0.0
       ],
       [
        0.5048,
        -0.0847,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "ray7",
      "kind": "poly",
      "pts": [
       [
        0.5345,
        -0.0653,
        0.0
       ],
       [
        0.5528,
        -0.0834,
        0.0
       ],
       [
        0.5413,
        -0.0545,
        0.0
       ]
      ],
      "colour": "indigo",
      "keyline": false
     },
     {
      "id": "plateF",
      "kind": "poly",
      "pts": [
       [
        0.6159,
        -0.1,
        0.02
       ],
       [
        0.7259,
        -0.1,
        0.02
       ],
       [
        0.7259,
        0.1,
        0.02
       ],
       [
        0.6159,
        0.1,
        0.02
       ]
      ],
      "colour": "key",
      "keyline": true
     },
     {
      "id": "plateB",
      "kind": "poly",
      "pts": [
       [
        0.2741,
        -0.1,
        0.02
       ],
       [
        0.3841,
        -0.1,
        0.02
       ],
       [
        0.3841,
        0.1,
        0.02
       ],
       [
        0.2741,
        0.1,
        0.02
       ]
      ],
      "colour": "key",
      "keyline": true
     },
     {
      "id": "highbackF",
      "kind": "poly",
      "pts": [
       [
        0.6259,
        -0.1,
        0.03
       ],
       [
        0.7159,
        -0.1,
        0.03
       ],
       [
        0.7059,
        -0.115,
        0.24
       ],
       [
        0.6359,
        -0.115,
        0.24
       ]
      ],
      "colour": "indigoS",
      "keyline": true
     },
     {
      "id": "highbackB",
      "kind": "poly",
      "pts": [
       [
        0.2841,
        -0.1,
        0.03
       ],
       [
        0.3741,
        -0.1,
        0.03
       ],
       [
        0.3641,
        -0.115,
        0.24
       ],
       [
        0.2941,
        -0.115,
        0.24
       ]
      ],
      "colour": "indigoS",
      "keyline": true
     }
    ],
    "note": "Freestyle twin: 1.58 m, 250 mm waist, 292 mm at nose and tail, blunt rounded ends kicked up 60 mm over the last 12%. Vermilion topsheet, paper caps with a three-scallop wave edge (seigaiha), an indigo rising sun between the bindings, indigo baseplates and highbacks on the heel side."
   },
   "space": "u = 0 at the tail to 1 at the nose; v = across in metres (+x in rider space, so −v is the snowboard heel side); h = up in metres. A point is tail + u·(nose − tail) + v·x̂ + h·ŷ in rider space, using the pose's tail and nose joints, then projected like any joint. v1.4: x̂ and ŷ are taken before twist and body pitch, and the whole point is then turned with the lower body (rotations.order), so the equipment keeps its shape when it is twisted or flipped.",
   "draw": "Draw shapes in list order: edge (the base and sidewall, offset down by the thickness), top with keyline, then the graphics, then the bindings. Colour names \"equip\" and \"equipAccent\" come from the rider's colourway; the rest are palette roles."
  },
  "height": 1.76
 },
 "features": {
  "kicker": {
   "note": "Kicker shape stays as the heightmap ramps from bump(px,py), KICK (14) and KBIG (5). This spec only covers how they look. Engineering to confirm the sizes below match.",
   "small": {
    "width": 4.0,
    "length": 5.0,
    "lipHeight": 1.2,
    "takeoffDeg": 26
   },
   "big": {
    "width": 6.0,
    "length": 8.0,
    "lipHeight": 2.4,
    "takeoffDeg": 32
   },
   "surface": {
    "face": "kickFace",
    "side": "kickSide",
    "cordOnFace": true,
    "cordPeriod": 0.8,
    "note": "Every cell inside a kicker footprint uses the kicker surface: kickFace when lit or mid, kickSide when in shade. The warm face is a different hue from the cold snow, so it reads even where the brightness is close."
   },
   "lipBand": {
    "colour": "key",
    "depth": 0.4,
    "halo": "paper",
    "haloDepth": 0.15,
    "note": "Indigo band across the full lip, 0.4 m deep from the edge, with a 0.15 m paper strip on each side so it reads against any tone."
   },
   "flags": {
    "atLipCorners": true,
    "insetFromEdge": 0.3
   }
  },
  "flag": {
   "poleHeight": 1.6,
   "poleWidth": 0.05,
   "flagW": 0.5,
   "flagH": 0.35,
   "pole": "key",
   "cloth": "flag",
   "halo": "paper",
   "haloPx": 1,
   "shape": "triangle pennant pointing downhill",
   "minPxHeight": 12,
   "note": "Billboard with a 1 px paper outline. Never drawn under 12 px tall, so a kicker at 80 m still shows two flags."
  },
  "rail": {
   "height": 0.7,
   "tubeDiameter": 0.08,
   "postEvery": 2.5,
   "postWidth": 0.06,
   "colour": "key",
   "highlight": "railHi",
   "highlightWidthFrac": 0.25,
   "shadow": "powderShade",
   "shadowOffset": [
    0.25,
    0.25
   ],
   "minPxWidth": 2
  },
  "box": {
   "height": 0.45,
   "width": 0.5,
   "deck": "paper",
   "deckEdge": "vermilion",
   "deckEdgeWidth": 0.06,
   "sides": "indigo",
   "ends": "indigoS",
   "shadow": "powderShade"
  },
  "knuckle": {
   "colour": "pisteMid",
   "note": "The rounded drop after a kicker table uses the mid tone so the landing reads before you reach it."
  },
  "markerPole": {
   "every": 20,
   "offsetOutsideEdge": 0.5,
   "height": 1.8,
   "width": 0.06,
   "bands": [
    "vermilion",
    "paper"
   ],
   "bandH": 0.3,
   "cap": "key",
   "minPxHeight": 8,
   "note": "Piste marker poles on both edges of the corridor, every 20 m along the run. Billboards. With the edge band, they show where the ridable line is at any distance."
  }
 },
 "environment": {
  "note": "v1.5 environment for real maps. Data only; the game does not read it until S4 builds from it. Units are metres and degrees; compass degrees at the art boundary. Every colour is a palette role, in fields named role, *Role, or inside an object called roles.",
  "trees": {
   "note": "Tree sets by map.treeSet. Profiles are the right-hand silhouette in tree-local metres: [halfWidth, height] from the foot of the trunk to the apex; mirror for the left. The reference tree is scaled uniformly by height / reference.heightM. Tips are the outer points of each tier; the segment from a tip up and inward to the next notch is the tier upper side, where snow load sits.",
   "sets": {
    "pine": {
     "note": "Pyrenean set. Mountain pine (Pinus uncinata) is the tree of the treeline; fir (Abies alba) is a sparse lower-forest variant. Variants young/mid/old follow trees.placement.sizeFrom: under 6 m, 6 to 10 m, over 10 m.",
     "mix": {
      "species": "uncinata",
      "variant": "fir",
      "firShareByAltM": [
       [
        1550,
        0.2
       ],
       [
        1750,
        0.1
       ],
       [
        1900,
        0
       ]
      ]
     },
     "species": {
      "uncinata": {
       "latin": "Pinus uncinata",
       "heightM": {
        "min": 5,
        "typical": 11,
        "max": 20
       },
       "crownRatio": {
        "min": 0.35,
        "typical": 0.5,
        "max": 0.6,
        "note": "crown width / height. Real mountain pine is 0.35 to 0.5; the typical value is a little fat for legibility (trees.pine is fatter still, about 0.7)."
       },
       "trunkClearM": {
        "min": 1.5,
        "typical": 2.4,
        "max": 4
       },
       "reference": {
        "heightM": 12,
        "crownWidthM": 6
       },
       "profile": [
        [
         0.15,
         0
        ],
        [
         0.15,
         2.4
        ],
        [
         3,
         2.9
        ],
        [
         1.2,
         4.4
        ],
        [
         2.5,
         4.8
        ],
        [
         1,
         6.3
        ],
        [
         2,
         6.7
        ],
        [
         0.8,
         8
        ],
        [
         1.5,
         8.4
        ],
        [
         0.55,
         9.6
        ],
        [
         0.95,
         10
        ],
        [
         0.25,
         11.2
        ],
        [
         0,
         12
        ]
       ],
       "roles": {
        "lit": "pineLit",
        "body": "pine",
        "shade": "pineS",
        "trunk": "trunk",
        "snow": "snowLoad",
        "snowShade": "snowLoadS"
       },
       "snowLoad": {
        "coverOfTierUpperSide": {
         "min": 0.3,
         "typical": 0.6,
         "max": 0.9
        },
        "byAltM": [
         [
          1600,
          0.2
         ],
         [
          2000,
          0.45
         ],
         [
          2300,
          0.75
         ]
        ],
        "thicknessM": 0.18,
        "sunSideMeltFrac": 0.3,
        "note": "Snow sits on the upper side of every tier, thicker toward the tip. The cover fraction rises with altitude. On the side facing the sun the load is 30% thinner. A tree on a slope over 30 degrees loads on its uphill side only."
       },
       "render": {
        "mesh": {
         "withinM": 120,
         "tiers": "one cone or flat disc per profile tier, 6 sides, flat shaded in lit/shade roles"
        },
        "billboard": {
         "fromM": 120,
         "facing": "camera yaw only (vertical axis)",
         "variants": 4,
         "note": "Pre-drawn from the profile: left half lit, right half shade (flip when the sun is on the right)."
        },
        "minPxHeight": 6,
        "belowMinPx": "drop the tree and let the forest-mass strip (roles.shade, hazed) stand for it"
       }
      },
      "fir": {
       "latin": "Abies alba",
       "heightM": {
        "min": 12,
        "typical": 18,
        "max": 30
       },
       "crownRatio": {
        "min": 0.28,
        "typical": 0.4,
        "max": 0.5
       },
       "trunkClearM": {
        "min": 2.5,
        "typical": 3.5,
        "max": 6
       },
       "reference": {
        "heightM": 18,
        "crownWidthM": 7.2
       },
       "profile": [
        [
         0.2,
         0
        ],
        [
         0.2,
         3.5
        ],
        [
         3.6,
         4.2
        ],
        [
         1.7,
         6.4
        ],
        [
         3.1,
         7.2
        ],
        [
         1.4,
         9.4
        ],
        [
         2.6,
         10.2
        ],
        [
         1.1,
         12.2
        ],
        [
         2,
         13.2
        ],
        [
         0.8,
         14.8
        ],
        [
         1.3,
         15.6
        ],
        [
         0.4,
         16.9
        ],
        [
         0,
         18
        ]
       ],
       "roles": {
        "lit": "firLit",
        "body": "fir",
        "shade": "firS",
        "trunk": "trunk",
        "snow": "snowLoad",
        "snowShade": "snowLoadS"
       },
       "snowLoad": {
        "coverOfTierUpperSide": {
         "min": 0.2,
         "typical": 0.45,
         "max": 0.75
        },
        "byAltM": [
         [
          1600,
          0.15
         ],
         [
          1900,
          0.3
         ]
        ],
        "thicknessM": 0.14,
        "sunSideMeltFrac": 0.3,
        "note": "As the pine, lighter: fir tiers droop and shed snow. Fir does not grow above 1900 m here."
       },
       "render": {
        "mesh": {
         "withinM": 120,
         "tiers": "one cone or flat disc per profile tier, 6 sides, flat shaded in lit/shade roles"
        },
        "billboard": {
         "fromM": 120,
         "facing": "camera yaw only (vertical axis)",
         "variants": 3,
         "note": "Pre-drawn from the profile: left half lit, right half shade (flip when the sun is on the right)."
        },
        "minPxHeight": 6,
        "belowMinPx": "drop the tree and let the forest-mass strip (roles.shade, hazed) stand for it"
       }
      }
     }
    },
    "sugi": {
     "note": "The procedural map. Documents the look of trees.sugi (variants 5, 8 and 12 m) in the same terms, so S4 can read both sets alike. Nothing here changes trees.sugi.",
     "mix": {
      "species": "sugi",
      "variant": null
     },
     "species": {
      "sugi": {
       "latin": "Cryptomeria japonica",
       "heightM": {
        "min": 4,
        "typical": 8,
        "max": 14
       },
       "crownRatio": {
        "min": 0.4,
        "typical": 0.55,
        "max": 0.68
       },
       "trunkClearM": {
        "min": 0.6,
        "typical": 1.1,
        "max": 1.7
       },
       "reference": {
        "heightM": 12,
        "crownWidthM": 5.06
       },
       "profile": [
        [
         0.84,
         0
        ],
        [
         0.84,
         0.98
        ],
        [
         2.53,
         0.98
        ],
        [
         0.76,
         2.45
        ],
        [
         2.15,
         2.6
        ],
        [
         0.65,
         4.07
        ],
        [
         1.77,
         4.21
        ],
        [
         0.53,
         5.68
        ],
        [
         1.39,
         5.83
        ],
        [
         0.42,
         7.3
        ],
        [
         1.01,
         7.44
        ],
        [
         0.3,
         8.91
        ],
        [
         0.63,
         9.06
        ],
        [
         0.19,
         10.53
        ],
        [
         0,
         12
        ]
       ],
       "roles": {
        "lit": "sugi",
        "body": "sugi",
        "shade": "sugiS",
        "trunk": "trunk",
        "snow": "paper",
        "snowShade": "paperS"
       },
       "snowLoad": {
        "coverOfTierUpperSide": {
         "min": 0.5,
         "typical": 0.7,
         "max": 0.9
        },
        "byAltM": [
         [
          0,
          0.7
         ]
        ],
        "thicknessM": 0.15,
        "sunSideMeltFrac": 0,
        "note": "The existing snow cap (trees.sugi.snowCap) stays as drawn; this block only names it."
       },
       "render": {
        "mesh": {
         "withinM": 120,
         "tiers": "one cone or flat disc per profile tier, 6 sides, flat shaded in lit/shade roles"
        },
        "billboard": {
         "fromM": 120,
         "facing": "camera yaw only (vertical axis)",
         "variants": 3,
         "note": "Pre-drawn from the profile: left half lit, right half shade (flip when the sun is on the right)."
        },
        "minPxHeight": 6,
        "belowMinPx": "drop the tree and let the forest-mass strip (roles.shade, hazed) stand for it"
       }
      }
     }
    }
   }
  },
  "treeline": {
   "note": "Bands are altitudes above sea level, set from a map's treelineM (the last upright trees) and shifted by aspect. A map may override any value in maps[id].treeline. This is more detailed than trees.placement.treeline (linear fade over 150 m) and adds krummholz above the line; for real maps S4 reads this section.",
   "defaults": {
    "bandsRelativeToTreelineM": [
     {
      "id": "forest",
      "upToOffsetM": -350,
      "densityPerHa": 380,
      "heightScale": 1,
      "note": "Closed forest. Every tree grows to its species range."
     },
     {
      "id": "thinning",
      "upToOffsetM": -100,
      "densityPerHa": 140,
      "heightScale": 0.8,
      "note": "Gaps and glades; trees are shorter."
     },
     {
      "id": "open",
      "upToOffsetM": 0,
      "densityPerHa": 40,
      "heightScale": 0.6,
      "note": "Scattered last trees, flagged by wind: the upwind side is bare."
     },
     {
      "id": "krummholz",
      "upToOffsetM": 120,
      "densityPerHa": 0,
      "bushDensityPerHa": 90,
      "heightScale": 0.2,
      "note": "No upright trees. Prostrate pine and juniper (bushes.kinds.krummholz)."
     }
    ],
    "aboveLastBand": "alpine: no trees and no bushes except grass tufts on wind-bared ridges; rocks and scree take over",
    "aspectShiftM": {
     "north": -60,
     "east": 0,
     "south": 60,
     "west": 0,
     "note": "Added to treelineM by the compass side a slope faces (linear between the four)."
    },
    "exclusion": {
     "pisteMarginM": 8,
     "liftMarginM": 10,
     "maxSlopeDeg": 40,
     "note": "No trees on the piste corridor plus 8 m (as TREE_CLEAR_M in world/map-trees.js), 10 m either side of a lift line, or on ground over 40 degrees."
    },
    "clustering": {
     "seed": "hash of map id and the 60 m tile index, so a map always gets the same trees",
     "patchScaleM": 70,
     "patchThreshold": {
      "forest": 0.28,
      "thinning": 0.42,
      "open": 0.58,
      "note": "Value-noise below the threshold is a clearing. Noise scale is patchScaleM."
     },
     "clumpTrees": {
      "min": 2,
      "max": 7
     },
     "clumpRadiusM": 9,
     "minSpacingM": 3.2,
     "gapChance": 0.12,
     "leeBias": {
      "frac": 0.35,
      "note": "Clumps are 35% more likely on the side of a ridge away from the prevailing wind (compass west for the Pyrenees: the lee is east)."
     }
    }
   }
  },
  "bushes": {
   "note": "Low plants. A bush is drawn as the part of it standing above the snow: snowDepthByAltM gives the depth, a bush shorter than the depth is hidden.",
   "snowDepthByAltM": [
    [
     1600,
     0.5
    ],
    [
     2000,
     1
    ],
    [
     2400,
     1.5
    ],
    [
     2700,
     0.8
    ]
   ],
   "kinds": {
    "krummholz": {
     "latin": "Pinus uncinata (prostrate)",
     "heightM": {
      "min": 1,
      "max": 3
     },
     "widthM": {
      "min": 2,
      "max": 5
     },
     "altitudeBandIds": [
      "open",
      "krummholz"
     ],
     "maxSlopeDeg": 38,
     "densityPerHa": {
      "open": 60,
      "krummholz": 90
     },
     "roles": {
      "lit": "krummholz",
      "shade": "krummholzS",
      "snow": "snowLoad"
     },
     "snowCover": 0.5,
     "minPxHeight": 4
    },
    "juniper": {
     "latin": "Juniperus communis nana",
     "heightM": {
      "min": 0.4,
      "max": 1
     },
     "widthM": {
      "min": 1.2,
      "max": 3
     },
     "altitudeM": {
      "min": 1700,
      "max": 2650
     },
     "maxSlopeDeg": 36,
     "densityPerHa": {
      "forest": 20,
      "thinning": 60,
      "open": 80,
      "krummholz": 60
     },
     "roles": {
      "lit": "scrub",
      "shade": "scrubS",
      "snow": "snowLoad"
     },
     "snowCover": 0.4,
     "minPxHeight": 3
    },
    "rhododendron": {
     "latin": "Rhododendron ferrugineum",
     "heightM": {
      "min": 0.5,
      "max": 1.2
     },
     "widthM": {
      "min": 0.8,
      "max": 2
     },
     "altitudeM": {
      "min": 1800,
      "max": 2500
     },
     "maxSlopeDeg": 34,
     "densityPerHa": {
      "thinning": 80,
      "open": 120,
      "krummholz": 40
     },
     "roles": {
      "lit": "rhodo",
      "shade": "scrubS",
      "snow": "snowLoad"
     },
     "snowCover": 0.4,
     "minPxHeight": 3,
     "note": "Grows in patches 8 to 25 m across (use clustering.patchScaleM 20). Prefers shaded north faces."
    },
    "grassTuft": {
     "latin": "dry grass",
     "heightM": {
      "min": 0.2,
      "max": 0.5
     },
     "widthM": {
      "min": 0.3,
      "max": 0.9
     },
     "altitudeM": {
      "min": 1700,
      "max": 2800
     },
     "slopeDeg": {
      "min": 18,
      "max": 38
     },
     "densityPerHa": {
      "krummholz": 100,
      "alpine": 60
     },
     "roles": {
      "lit": "scrub",
      "shade": "scrubS",
      "snow": "snowLoad"
     },
     "snowCover": 0,
     "minPxHeight": 2,
     "note": "Only on convex, wind-bared ridges; shows where snowDepthByAltM is under its height or the slope is over 30 degrees."
    }
   },
   "render": {
    "form": "billboard blob: two overlapping ellipses, lit left and shade right, with the snow cover as a paper-coloured top slab",
    "keyline": "key",
    "note": "Keyline 1 px. Under minPxHeight draw a 2 px dot or nothing."
   }
  },
  "rocks": {
   "note": "Rock shows where snow cannot lie. slopeDeg is the local slope of the terrain.",
   "snowRule": {
    "slopeDeg": {
     "snowFull": 30,
     "patchy": 32,
     "rockShows": 38,
     "mostlyRock": 45,
     "bare": 55
    },
    "rockShareAt": [
     [
      30,
      0
     ],
     [
      32,
      0.05
     ],
     [
      38,
      0.35
     ],
     [
      45,
      0.75
     ],
     [
      55,
      1
     ]
    ],
    "windScour": {
     "ridgeCrestLowersThresholdsDeg": 8,
     "note": "On a convex ridge crest every slope threshold above is lowered by 8 degrees."
    },
    "note": "rockShows matches trees.placement.rocks (over 38 degrees). Between patchy and bare the share of rock rises as rockShareAt (slope, share 0 to 1), laid out by noise of 12 m scale so it reads as patches."
   },
   "snowCap": {
    "role": "snowLoad",
    "shadeRole": "snowLoadS",
    "depthM": {
     "min": 0.15,
     "max": 0.4
    },
    "rule": "Each rock gets a cap over the faces whose normal is within 55 degrees of up. The cap is thinner (0.15 m) on the sun side, thicker (0.4 m) on the shade side, and absent on faces steeper than 70 degrees.",
    "keyline": "key"
   },
   "kinds": {
    "boulder": {
     "sizeM": {
      "min": 0.8,
      "max": 3.5
     },
     "shape": "trees.rock.shape scaled",
     "slopeDeg": {
      "min": 20,
      "max": 55
     },
     "densityPerHa": {
      "onRockGround": 80,
      "elsewhere": 6
     },
     "roles": {
      "lit": "rockLit",
      "body": "rock",
      "shade": "rockS"
     },
     "minPxHeight": 4
    },
    "outcrop": {
     "widthM": {
      "min": 4,
      "max": 14
     },
     "heightM": {
      "min": 2,
      "max": 7
     },
     "shape": "angular slab with 2 to 4 stepped faces",
     "slopeDeg": {
      "min": 38,
      "max": 65
     },
     "densityPerHa": {
      "onRockGround": 14,
      "elsewhere": 0
     },
     "roles": {
      "lit": "rockLit",
      "body": "rock",
      "shade": "rockS"
     },
     "minPxHeight": 5
    },
    "screeField": {
     "lengthM": {
      "min": 15,
      "max": 90
     },
     "widthM": {
      "min": 10,
      "max": 40
     },
     "slopeDeg": {
      "min": 28,
      "max": 38
     },
     "altitudeM": {
      "min": 1900,
      "max": 2800
     },
     "densityPerHa": {
      "alpine": 3,
      "krummholz": 1
     },
     "roles": {
      "lit": "scree",
      "shade": "screeS"
     },
     "form": "ground patch: terrain surface colour speckled 1 to 3 px, no billboard",
     "note": "Grain 0.3 m. Snow may cover up to 60% of it, laid out by noise."
    },
    "cliffBand": {
     "heightM": {
      "min": 8,
      "max": 40
     },
     "lengthM": {
      "min": 30,
      "max": 180
     },
     "slopeDeg": {
      "min": 55,
      "max": 90
     },
     "densityPerHa": {
      "onBareGround": 1
     },
     "roles": {
      "lit": "rockLit",
      "body": "cliff",
      "shade": "rockS"
     },
     "form": "a vertical or overhung face along a contour; drawn as a terrain surface where slope is over 55 degrees, with a snow ledge cap every 6 to 10 m of height",
     "note": "Where the terrain is over 55 degrees (bare in snowRule) the surface takes the cliff role."
    }
   }
  },
  "sky": {
   "note": "The dawn sky seen from the ground, by elevation angle above the horizon. Replaces screen-fraction stops (sky.stops) for real maps and follows the map's sun.",
   "stops": [
    {
     "elevationDeg": 90,
     "role": "skyTop"
    },
    {
     "elevationDeg": 45,
     "role": "skyMid"
    },
    {
     "elevationDeg": 14,
     "role": "skyDawn"
    },
    {
     "elevationDeg": 0,
     "role": "skyHorizon"
    },
    {
     "elevationDeg": -4,
     "role": "fog"
    }
   ],
   "interpolation": "linear in sRGB between stops (bokashi, no banding steps)",
   "followsSun": {
    "source": "maps[id].sun (azimuthDeg compass, elevationDeg)",
    "warmSide": {
     "halfWidthDeg": 90,
     "dawnStopElevationDeg": 26,
     "note": "The skyDawn stop rises from 14 to 26 degrees on the sun azimuth and falls back to 14 at 90 degrees either side (cosine)."
    },
    "coolSide": {
     "dawnStopElevationDeg": 8,
     "horizonMixToSkyMid": 0.3,
     "note": "Opposite the sun the dawn band sinks to 8 degrees and the horizon is 30% skyMid."
    }
   },
   "sun": {
    "role": "sun",
    "discDiameterDeg": 5,
    "glow": {
     "role": "sunGlow",
     "radiusDeg": 20,
     "falloff": "quadratic",
     "alphaCentre": 0.6
    },
    "horizonBand": {
     "role": "sunGlow",
     "halfWidthDeg": 45,
     "heightDeg": 8,
     "alpha": 0.35,
     "note": "A low band of glow along the horizon, centred on the sun azimuth."
    },
    "elevationClampDeg": {
     "min": 0.5,
     "max": 60
    },
    "behindBackdrops": true,
    "note": "discDiameterDeg 5 equals sky.sun.radiusFracOfWidth 0.045 at a 55 degree horizontal field of view. Drawn at the compass azimuth and elevation of maps[id].sun. Hidden where a backdrop layer is higher than the sun."
   },
   "alpenglow": {
    "role": "alpenglow",
    "tintMix": 0.45,
    "onLayers": [
     "mid",
     "far"
    ],
    "withinDegOfSunAzimuth": 55,
    "fadesOutAboveSunElevationDeg": 24,
    "note": "The snow caps of mid and far layers within 55 degrees of the sun azimuth are tinted toward alpenglow while the sun is under 24 degrees. The near layer is not: it is in the valley shade."
   },
   "haze": {
    "stops": [
     {
      "distM": 0,
      "mix": 0,
      "role": "fog"
     },
     {
      "distM": 40,
      "mix": 0,
      "role": "fog"
     },
     {
      "distM": 300,
      "mix": 0.18,
      "role": "fog"
     },
     {
      "distM": 1500,
      "mix": 0.35,
      "role": "fog"
     },
     {
      "distM": 5000,
      "mix": 0.5,
      "role": "skyHorizon"
     },
     {
      "distM": 12000,
      "mix": 0.65,
      "role": "skyHorizon"
     },
     {
      "distM": 30000,
      "mix": 0.8,
      "role": "skyHorizon"
     }
    ],
    "note": "Mix toward the role colour by distance in metres, linear between stops. The first two stops are terrain.fog (start 40 m). Valley mist (terrain.gradient.valleyMist) is added to this, never replaced."
   }
  },
  "backdrops": {
   "pyrenees": {
    "note": "Distant mountains for El Tarter and the Andorran Pyrenees. Three layers by distance. Each layer is drawn as a profile polyline with a keyline (mountains.real). The baked horizon gives the near terrain out to the edge of the map; the named peaks give summits beyond it.",
    "layers": [
     {
      "id": "near",
      "minM": 2000,
      "maxM": 8000,
      "parallax": 0.25,
      "hazeMix": 0.2,
      "roles": {
       "fill": "mtnNear",
       "shade": "mtnNearS",
       "cap": "mtnNearCap"
      },
      "cap": {
       "snowlineM": 1900,
       "depthM": 380
      }
     },
     {
      "id": "mid",
      "minM": 8000,
      "maxM": 18000,
      "parallax": 0.18,
      "hazeMix": 0.45,
      "roles": {
       "fill": "mtnMid",
       "shade": "mtnMidS",
       "cap": "mtnMidCap"
      },
      "cap": {
       "snowlineM": 1900,
       "depthM": 520
      }
     },
     {
      "id": "far",
      "minM": 18000,
      "maxM": 60000,
      "parallax": 0.12,
      "hazeMix": 0.7,
      "roles": {
       "fill": "mtnFar",
       "shade": "mtnFarS",
       "cap": "mtnFarCap"
      },
      "cap": {
       "snowlineM": 1900,
       "depthM": 700
      }
     }
    ],
    "capRule": "Snow covers a summit from its top down to max(snowlineM, altM - depthM). Winter snowline is 1900 m for the Andorran Pyrenees (higher on south faces). The cap edge is jagged every 2 degrees by 25% of its depth (mountains.real.ridge).",
    "shadeRule": "The face away from the sun azimuth is filled in the shade role, as mountains.real.",
    "ridge": {
     "profile": "triangle",
     "floorElevDeg": -1,
     "verticalExaggeration": 2,
     "jag": {
      "everyDeg": 2,
      "depthFrac": 0.25
     },
     "note": "Each named summit is a triangle (as mountains.procedural): its apex is elevDeg x verticalExaggeration above the horizon, and it falls in a straight line to floorElevDeg at atan(halfWidthM / distM) degrees of bearing either side. Where triangles of one layer overlap, take the higher. Real elevations are only 1.5 to 6.5 degrees, so S4 may lift the ridge by verticalExaggeration, keeping bearings true. Where the baked horizon (course.horizon) is higher than a layer, the baked profile wins for the near layer."
    },
    "peaks": [
     {
      "id": "casamanya",
      "name": "Pic de Casamanya",
      "layer": "near",
      "lat": 42.5841,
      "lon": 1.5655,
      "altM": 2740,
      "bearingEnuDeg": 159.1,
      "bearingCompassDeg": 290.9,
      "distM": 7899,
      "elevDeg": 2.02,
      "horizonAtStartDeg": -4.4,
      "halfWidthM": 1300,
      "source": "peakbook.org element 54931 (UTM converted)"
     },
     {
      "id": "estanyo",
      "name": "Pic de l'Estanyó",
      "layer": "near",
      "lat": 42.6085,
      "lon": 1.5926,
      "altM": 2915,
      "bearingEnuDeg": 133,
      "bearingCompassDeg": 317,
      "distM": 7558,
      "elevDeg": 3.43,
      "horizonAtStartDeg": -3,
      "halfWidthM": 1500,
      "source": "peakbook.org element 78414 (UTM converted)"
     },
     {
      "id": "serrera",
      "name": "Pic de la Serrera",
      "layer": "mid",
      "lat": 42.626,
      "lon": 1.601,
      "altM": 2912,
      "bearingEnuDeg": 120.8,
      "bearingCompassDeg": 329.2,
      "distM": 8704,
      "elevDeg": 2.96,
      "horizonAtStartDeg": 2.1,
      "halfWidthM": 1300,
      "source": "GeoNames highest mountains of Andorra"
     },
     {
      "id": "comaPedrosa",
      "name": "Coma Pedrosa",
      "layer": "mid",
      "lat": 42.59056,
      "lon": 1.44478,
      "altM": 2943,
      "bearingEnuDeg": 168.4,
      "bearingCompassDeg": 281.6,
      "distM": 17648,
      "elevDeg": 1.56,
      "horizonAtStartDeg": -1.8,
      "halfWidthM": 2200,
      "source": "Wikipedia: Coma Pedrosa"
     },
     {
      "id": "picaEstats",
      "name": "Pica d'Estats",
      "layer": "far",
      "lat": 42.66722,
      "lon": 1.39722,
      "altM": 3143,
      "bearingEnuDeg": 150.3,
      "bearingCompassDeg": 299.7,
      "distM": 24370,
      "elevDeg": 1.6,
      "horizonAtStartDeg": -8.7,
      "halfWidthM": 3000,
      "source": "Wikipedia: Pica d'Estats"
     },
     {
      "id": "altGriu",
      "name": "Alt del Griu",
      "layer": "near",
      "lat": 42.526,
      "lon": 1.652,
      "altM": 2874,
      "bearingEnuDeg": 265.6,
      "bearingCompassDeg": 184.4,
      "distM": 3646,
      "elevDeg": 6.45,
      "horizonAtStartDeg": 0.7,
      "halfWidthM": 1000,
      "source": "GeoNames highest mountains of Andorra"
     },
     {
      "id": "pessons",
      "name": "Pic dels Pessons",
      "layer": "near",
      "lat": 42.508,
      "lon": 1.665,
      "altM": 2864,
      "bearingEnuDeg": 278,
      "bearingCompassDeg": 172,
      "distM": 5690,
      "elevDeg": 4.04,
      "horizonAtStartDeg": 0.9,
      "halfWidthM": 1000,
      "source": "GeoNames highest mountains of Andorra"
     },
     {
      "id": "picNegre",
      "name": "Pic Negre d'Envalira",
      "layer": "near",
      "lat": 42.51722,
      "lon": 1.72139,
      "altM": 2823,
      "bearingEnuDeg": 319.7,
      "bearingCompassDeg": 130.3,
      "distM": 7118,
      "elevDeg": 2.9,
      "horizonAtStartDeg": -2.4,
      "halfWidthM": 1100,
      "source": "Wikipedia: Pic Negre d'Envalira"
     },
     {
      "id": "envalira",
      "name": "Pic d'Envalira",
      "layer": "near",
      "lat": 42.51879,
      "lon": 1.72485,
      "altM": 2659,
      "bearingEnuDeg": 322.2,
      "bearingCompassDeg": 127.8,
      "distM": 7229,
      "elevDeg": 1.56,
      "horizonAtStartDeg": -2.8,
      "halfWidthM": 800,
      "source": "aroundus.com 4041992"
     },
     {
      "id": "maia",
      "name": "Pic del Maià",
      "layer": "near",
      "lat": 42.55384,
      "lon": 1.71889,
      "altM": 2615,
      "bearingEnuDeg": 354.1,
      "bearingCompassDeg": 95.9,
      "distM": 5244,
      "elevDeg": 1.67,
      "horizonAtStartDeg": -3.5,
      "halfWidthM": 1000,
      "source": "elevation visitandorra.com; position komoot highlight 3422136 (map centre, approx)"
     }
    ],
    "peaksNote": "Positions are from the course start (maps.el-tarter.startWorld) in the world frame. bearingEnuDeg is counter-clockwise from east (ADR 0005); bearingCompassDeg is clockwise from north (the art boundary). elevDeg = atan((altM - start altitude) / distM), flat earth (curvature is under 0.1 degrees at 25 km). horizonAtStartDeg is the terrain-grid horizon from the start at that bearing: a peak whose elevDeg is above it is visible. halfWidthM is art-directed, not measured."
   }
  },
  "contrastTargets": [
   {
    "a": "pine",
    "b": "pisteLit",
    "min": 6,
    "why": "Mountain pine body against lit snow"
   },
   {
    "a": "pineLit",
    "b": "pisteLit",
    "min": 4.5,
    "why": "Lit pine side against lit snow"
   },
   {
    "a": "fir",
    "b": "pisteLit",
    "min": 6,
    "why": "Fir body against lit snow"
   },
   {
    "a": "firLit",
    "b": "pisteLit",
    "min": 4.5,
    "why": "Lit fir side against lit snow"
   },
   {
    "a": "trunk",
    "b": "pisteLit",
    "min": 6,
    "why": "Trunk against snow"
   },
   {
    "a": "snowLoad",
    "b": "pine",
    "min": 6,
    "why": "Snow on pine tiers"
   },
   {
    "a": "snowLoad",
    "b": "fir",
    "min": 6,
    "why": "Snow on fir tiers"
   },
   {
    "a": "snowLoadS",
    "b": "pine",
    "min": 3.5,
    "why": "Shaded snow on pine tiers"
   },
   {
    "a": "snowLoad",
    "b": "rock",
    "min": 3,
    "why": "Snow cap on rock"
   },
   {
    "a": "krummholz",
    "b": "powderLit",
    "min": 4,
    "why": "Krummholz in powder"
   },
   {
    "a": "scrub",
    "b": "powderLit",
    "min": 3,
    "why": "Juniper and grass in powder"
   },
   {
    "a": "rhodo",
    "b": "powderLit",
    "min": 4,
    "why": "Rhododendron in powder"
   },
   {
    "a": "rock",
    "b": "pisteLit",
    "min": 3.5,
    "why": "Rock against lit snow"
   },
   {
    "a": "rockLit",
    "b": "pisteLit",
    "min": 2.4,
    "why": "Lit rock face against lit snow"
   },
   {
    "a": "cliff",
    "b": "pisteLit",
    "min": 6,
    "why": "Cliff against lit snow"
   },
   {
    "a": "scree",
    "b": "pisteLit",
    "min": 2,
    "why": "Scree against lit snow"
   },
   {
    "a": "scree",
    "b": "powderLit",
    "min": 1.6,
    "why": "Scree against powder"
   },
   {
    "a": "mtnFar",
    "b": "skyHorizon",
    "min": 1.4,
    "why": "Far layer against the horizon sky"
   },
   {
    "a": "mtnMid",
    "b": "mtnFar",
    "min": 1.15,
    "why": "Mid layer against far layer"
   },
   {
    "a": "mtnNear",
    "b": "mtnMid",
    "min": 1.25,
    "why": "Near layer against mid layer"
   },
   {
    "a": "mtnNearCap",
    "b": "mtnNear",
    "min": 2.4,
    "why": "Near snow cap"
   },
   {
    "a": "mtnMidCap",
    "b": "mtnMid",
    "min": 1.9,
    "why": "Mid snow cap"
   },
   {
    "a": "mtnFarCap",
    "b": "mtnFar",
    "min": 1.6,
    "why": "Far snow cap"
   },
   {
    "a": "alpenglow",
    "b": "skyDawn",
    "min": 1.15,
    "why": "Glowing summits against the dawn band"
   },
   {
    "a": "sun",
    "b": "sunGlow",
    "min": 1.2,
    "why": "Sun disc against its glow"
   }
  ]
 },
 "terrain": {
  "sun": {
   "perMap": true,
   "note": "Set per map and art-directed, not astronomical. azimuthDeg and elevationDeg are in world (compass) terms; vector is the same in world x/y/z. The terrain shading and the backdrop sun disc both read this one value, so they always agree.",
   "rule": "Pick the azimuth so the main run's fall line is 60–120° from it (lit from the side, never from behind the camera or straight into it). Check: at least 60% of corridor cells must come out lit or mid, or the loader logs a warning."
  },
  "posterise": {
   "mode": "relative",
   "reference": "a plane at the map's mean run gradient (maps[id].meanSlopeDeg), tilted along the local fall line",
   "steps": [
    [
     "lit",
     -0.06
    ],
    [
     "mid",
     -0.22
    ],
    [
     "shade",
     null
    ]
   ],
   "note": "shade = dot(normal, sun) − dot(referenceNormal, sun). At or above −0.06 it is lit, at or above −0.22 it is mid, otherwise shade. Hard steps with no blending. Because the reference follows the run's direction, a groomed piste at the typical gradient reads lit whichever way the run faces. The reference gradient is fixed per map (v1.1 used the slope just ahead, which hid every change of gradient); terrain.gradient adds the steepness term."
  },
  "resolution": {
   "upsampleTo": 2.0,
   "method": "bicubic",
   "shadePer": "render pixel",
   "normals": "bilinear between upsampled cells",
   "note": "Real data at about 14 m per cell is upsampled to 2 m (bicubic) before normals are taken. The tone is chosen per render pixel from the interpolated normal, so tone edges are crisp but never blockier than one render pixel (about 2 screen px at the game's render resolution). The stepping on the v1.0 board 06 swatches was a drawing artefact and is not intended."
  },
  "surfaces": {
   "piste": {
    "lit": "pisteLit",
    "mid": "pisteMid",
    "shade": "pisteShade",
    "cord": true
   },
   "powder": {
    "lit": "powderLit",
    "mid": "powderMid",
    "shade": "powderShade",
    "cord": false
   },
   "kicker": {
    "lit": "kickFace",
    "mid": "kickFace",
    "shade": "kickSide",
    "cord": true
   }
  },
  "corduroy": {
   "period": 0.8,
   "duty": 0.5,
   "colour": "cord",
   "mix": 0.55,
   "along": "the piste centreline",
   "fadeOutBeyond": 60,
   "perPixel": true,
   "note": "Computed per pixel from the hit point's distance across the piste centreline (floor(across / period) is odd → mix .55 toward cord). It is not painted into the colour map, so a 7 km run needs no huge image. Fades out beyond 60 m."
  },
  "pisteEdge": {
   "width": 1.0,
   "colour": "pisteEdge",
   "perPixel": true,
   "note": "A 1 m band just inside the corridor edge, decided per pixel from the same distance across the centreline. Contrast 3.7:1 against lit piste."
  },
  "treeShadow": {
   "lengthFrac": 0.9,
   "widthFrac": 0.35,
   "colourStep": "shade",
   "note": "Offset away from the sun azimuth. Painted once per tree into a coarse shadow mask, or drawn as a flat ellipse on the ground under the billboard."
  },
  "fog": {
   "colour": "fog",
   "rgb": [
    242,
    213,
    198
   ],
   "start": 40,
   "power": 1.4,
   "note": "Replaces FOG=[214,220,238]. mix(surface, fog, clamp((d − start) / (far − start))^power)."
  },
  "gradient": {
   "summary": "Three cues show how steep the ground is and where it changes: the steepness tone, the drop edge and the valley mist. They work together with the partial camera tilt in camera.slopeFollow. Level contour lines on the powder were tried and dropped: too faint at play size and noisy close up.",
   "slopeTone": {
    "perDeg": -0.012,
    "clamp": [
     -0.3,
     0.06
    ],
    "reference": "maps[id].meanSlopeDeg",
    "note": "Added to the sun delta before the tone steps: each degree steeper than the map's mean gradient moves the shade 0.012 toward the darker tones, and flatter ground moves it toward lit, capped at +0.06. A pitch 12° steeper than the mean drops about a full step, so steep sections read as a darker band from far above, from their lip and while you ride them, and run-outs read bright."
   },
   "dropEdge": {
    "colour": "key",
    "alpha": 0.6,
    "minJumpM": 4.0,
    "jumpFrac": 0.12,
    "widthPx": 1,
    "note": "Where the ground drops out of sight (a render pixel whose upper neighbour is more than max(4 m, 12% of its distance) farther away), draw a 1 render-pixel indigo keyline at 60%, faded with the fog. It is the woodblock outline of a convex rollover, and it shows exactly where the slope falls away."
   },
   "valleyMist": {
    "startBelowM": 15,
    "fullBelowM": 90,
    "add": 0.35,
    "note": "Dawn mist lies in the valley: ground more than 15 m below the rider gets extra fog, rising to +35% at 90 m below. Steep drops then read as layers of paler ground, and the run below a pitch looks far beneath you."
   }
  }
 },
 "sky": {
  "stops": [
   [
    0,
    "skyTop"
   ],
   [
    0.5,
    "skyMid"
   ],
   [
    0.82,
    "skyDawn"
   ],
   [
    1,
    "skyHorizon"
   ]
  ],
  "note": "Vertical gradient from the top of the screen (0) to the horizon line (1), the bokashi fade.",
  "sun": {
   "colour": "sun",
   "radiusFracOfWidth": 0.045,
   "aboveHorizonFrac": 0.06,
   "behindMountains": true,
   "note": "Drawn at the map's sun azimuth (compass), so it sits on the side the snow is lit from."
  }
 },
 "mountains": {
  "procedural": {
   "layers": [
    {
     "id": "far",
     "parallax": 0.12,
     "fill": "mtnFar",
     "shade": "mtnFarS",
     "cap": "mtnFarCap",
     "capFrac": 0.36,
     "peaks": [
      [
       -160,
       0.42,
       16
      ],
      [
       -120,
       0.34,
       13
      ],
      [
       -85,
       0.48,
       18
      ],
      [
       -45,
       0.38,
       14
      ],
      [
       -10,
       0.52,
       17
      ],
      [
       25,
       0.36,
       12
      ],
      [
       60,
       0.46,
       16
      ],
      [
       100,
       0.33,
       13
      ],
      [
       140,
       0.4,
       15
      ]
     ]
    },
    {
     "id": "near",
     "parallax": 0.25,
     "fill": "mtnNear",
     "shade": "mtnNearS",
     "cap": "mtnNearCap",
     "capFrac": 0.34,
     "peaks": [
      [
       -140,
       0.24,
       10
      ],
      [
       -100,
       0.2,
       9
      ],
      [
       -60,
       0.28,
       11
      ],
      [
       -25,
       0.22,
       9
      ],
      [
       15,
       0.3,
       12
      ],
      [
       50,
       0.21,
       9
      ],
      [
       90,
       0.26,
       10
      ],
      [
       130,
       0.2,
       9
      ],
      [
       170,
       0.25,
       10
      ]
     ]
    }
   ],
   "note": "Peaks are (headingDeg relative to the run heading, heightAsFractionOfSkyHeight, halfWidthDeg) and wrap round 360°. Each is a triangle standing on the visible terrain edge. Sky height means the screen distance from that edge to the top. Half-widths are 9–18° so peaks stay pointed in the 66° view (v1.0 used 22–44°, which looked like flat mesas in play)."
  },
  "capShape": {
   "points": [
    [
     0,
     0
    ],
    [
     1,
     1
    ],
    [
     0.45,
     0.78
    ],
    [
     0.05,
     1.05
    ],
    [
     -0.4,
     0.8
    ],
    [
     -1,
     1
    ]
   ],
   "note": "Snow cap polygon in units of (halfWidth × capFrac, height × capFrac), measured from the peak: x to the right, y downwards. The jagged lower edge is points 2–4."
  },
  "shadeFace": "The wedge from the peak to the base on the side away from the sun azimuth, ending 15% of the half-width past the peak line.",
  "real": {
   "source": "The baker computes a horizon profile from the run's midpoint: for each compass heading (1° steps), the highest elevation angle of the coarse ring (zoom 10, about 110 m per pixel).",
   "layers": [
    {
     "id": "near",
     "minKm": 3,
     "maxKm": 8,
     "fill": "mtnNear",
     "shade": "mtnNearS",
     "cap": "mtnNearCap",
     "parallax": 0.25
    },
    {
     "id": "far",
     "minKm": 8,
     "maxKm": 40,
     "fill": "mtnFar",
     "shade": "mtnFarS",
     "cap": "mtnFarCap",
     "parallax": 0.12
    }
   ],
   "smoothDeg": 3,
   "peaks": {
    "minProminenceDeg": 0.5,
    "minSpacingDeg": 10,
    "maxPerLayer": 8
   },
   "ridge": {
    "flatSlope": 0.25,
    "capReliefFrac": 0.35,
    "jagEveryDeg": 2,
    "jagDepthFrac": 0.25
   },
   "note": "Each layer is drawn as its real profile (a polyline, not triangles), with a keyline. Peaks are local maxima at least 0.5° above the saddles either side and at least 10° apart, up to 8 per layer. Each peak gets a snow cap down 35% of its relief and a shade face on the side away from the sun. A long ridge (profile slope under 0.25° per degree) gets one continuous snow band instead of separate caps, with a jag every 2°. Profiles go into the terrain file as horizon: {stepDeg, near: [...], far: [...]} in degrees above the horizontal."
  },
  "keyline": {
   "colour": "key",
   "px": 1
  }
 },
 "trees": {
  "sugi": {
   "variants": [
    {
     "id": "young",
     "height": 5,
     "tiers": 4
    },
    {
     "id": "mid",
     "height": 8,
     "tiers": 5
    },
    {
     "id": "old",
     "height": 12,
     "tiers": 6
    }
   ],
   "geometry": {
    "trunkH": 0.14,
    "trunkW": 0.05,
    "firstTierBase": 0.1,
    "tierStep": 0.165,
    "tierH": 0.3,
    "baseHalfW": 0.34,
    "taper": 0.15
   },
   "colours": {
    "fill": "sugi",
    "shade": "sugiS",
    "trunk": "trunk",
    "snow": "paper",
    "keyline": "key"
   },
   "snowCap": [
    [
     -0.62,
     0.62
    ],
    [
     -0.3,
     0.5
    ],
    [
     0,
     0.66
    ],
    [
     0.25,
     0.52
    ],
    [
     0.6,
     0.6
    ],
    [
     0,
     0
    ]
   ],
   "jitter": {
    "width": 0.08,
    "height": 0.06
   },
   "note": "Billboard. Tier i (0 = bottom): base at height × (firstTierBase + i·tierStep), apex tierH × height above that, half-width height × baseHalfW × (1 − i·taper). Left half in fill, right half in shade (flip if the sun is on the right). Snow cap points are (x as a fraction of half-width, y as a fraction of tier height from the apex)."
  },
  "pine": {
   "variants": [
    {
     "id": "young",
     "height": 5
    },
    {
     "id": "mid",
     "height": 9
    },
    {
     "id": "old",
     "height": 14
    }
   ],
   "geometry": {
    "trunkH": 0.3,
    "trunkW": 0.06,
    "shelves": [
     [
      0.3,
      0.3
     ],
     [
      0.44,
      0.36
     ],
     [
      0.58,
      0.3
     ],
     [
      0.7,
      0.26
     ],
     [
      0.82,
      0.18
     ],
     [
      0.92,
      0.1
     ]
    ],
    "shelfH": 0.1,
    "crownTop": 1.0
   },
   "colours": {
    "fill": "pine",
    "shade": "pineS",
    "trunk": "trunk",
    "snow": "paper",
    "keyline": "key"
   },
   "jitter": {
    "width": 0.12,
    "height": 0.08,
    "shelfOffset": 0.05
   },
   "note": "Mountain pine (Pinus uncinata), the tree of the Pyrenean treeline. A bare lower trunk, then flat snow-loaded shelves: each shelf is (centre height, half-width) as fractions of tree height, shelfH tall, with a paper snow slab along its top edge. The shelves shift left or right by shelfOffset at random for the ragged pine outline. Same keyline and shading rule as sugi."
  },
  "bush": {
   "height": 1.2,
   "moundW": 1.6,
   "moundH": 0.5,
   "tiers": 2,
   "note": "A young tree buried in deep powder: the top two tiers of a sugi, or the top two shelves of a pine, rising from a paper mound (moundW × moundH ellipse with a keyline)."
  },
  "rock": {
   "sizes": [
    0.8,
    1.6,
    2.8
   ],
   "fill": "rock",
   "shade": "rockS",
   "cap": "paper",
   "shape": [
    [
     -0.5,
     0
    ],
    [
     -0.42,
     0.45
    ],
    [
     -0.1,
     0.7
    ],
    [
     0.25,
     0.62
    ],
    [
     0.5,
     0.2
    ],
    [
     0.48,
     0
    ]
   ],
   "shadeShape": [
    [
     -0.1,
     0.7
    ],
    [
     0.25,
     0.62
    ],
    [
     0.5,
     0.2
    ],
    [
     0.48,
     0
    ],
    [
     0.05,
     0
    ]
   ],
   "capShape": [
    [
     -0.42,
     0.45
    ],
    [
     -0.1,
     0.7
    ],
    [
     0.25,
     0.62
    ],
    [
     0.4,
     0.42
    ],
    [
     0.1,
     0.5
    ],
    [
     -0.2,
     0.44
    ]
   ],
   "note": "Polygons as fractions of size (x across, y up from the base). shadeShape is filled in rockS on the side away from the sun; capShape is the paper snow cap."
  },
  "placement": {
   "treeSet": "Per map: sugi for the procedural map, pine for Pyrenees maps.",
   "sizeFrom": "Canopy height when the terrain file has it: under 6 m young, 6–10 m mid, over 10 m old. Otherwise from elevation: young near the treeline, mid and old lower down.",
   "treeline": {
    "fadeBandM": 150,
    "note": "Tree density falls linearly to 0 over the last 150 m below treelineM. No trees above it."
   },
   "density": "From the terrain file's woods or canopy grid when it has one (from OSM woods, later canopy height). Otherwise the current rule-based placement.",
   "clearOfPisteEdge": 2.0,
   "bush": "In deep powder 2–8 m outside the corridor edge, and inside the treeline fade band. 1 bush for every 4 trees there.",
   "rocks": "On ground too steep to hold snow (slope over 38°) and on ridge crests. About 1 rock per 30 m² of such ground, sizes picked at random. This replaces the random 15% mix.",
   "note": "Nothing goes inside the groomed corridor or in the feature-free stretch between y 460 and 740 on the procedural map."
  }
 },
 "particles": {
  "spray": {
   "radius": [
    0.15,
    0.4
   ],
   "life": 0.5,
   "colour": "spray",
   "underside": "sprayS",
   "keyline": false
  },
  "landing": {
   "count": 10,
   "radius": [
    0.2,
    0.5
   ],
   "life": 0.6
  },
  "wipeout": {
   "count": 16,
   "radius": [
    0.2,
    0.6
   ],
   "life": 0.9,
   "note": "Plus 2 or 3 paper-coloured snow chunks with keylines."
  }
 },
 "grain": {
  "tile": 128,
  "seed": 7,
  "amplitude": 40,
  "composite": "soft-light",
  "alpha": 0.16,
  "animated": false,
  "toggle": {
   "storageKey": "gresca-grain",
   "default": "1",
   "menuLabel": "Paper grain"
  },
  "note": "Build a 128x128 grey noise tile (128 plus or minus 40, alpha 1) once in an offscreen canvas. Each frame, fill the screen with it as a pattern after everything else (the HUD stays in the DOM, so it is not affected). It does not move, so it reads as paper and not as TV static."
 },
 "ui": {
  "fonts": {
   "display": "\"Shippori Mincho\", \"Hiragino Mincho ProN\", \"Yu Mincho\", \"Noto Serif JP\", Georgia, serif",
   "ui": "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
   "note": "No web fonts are fetched (the game must run offline from one file). Shippori Mincho is used only if installed or embedded; the stack falls back to system Mincho, then Georgia."
  },
  "fontSubset": {
   "family": "Shippori Mincho ExtraBold",
   "licence": "SIL Open Font License",
   "glyphs": "GRESCA グレスカ 0123456789,+×° km/h",
   "budgetKB": 16,
   "embed": "base64 WOFF2 in a @font-face inside index.html",
   "fallbackNote": "If the subset is not embedded, the title falls back to Georgia and the kana to the system sans. Board 07 shows that fallback, and it is acceptable."
  },
  "start": {
   "panel": "paper",
   "panelAlpha": 0.94,
   "keyline": "key",
   "radius": 14,
   "title": "GRESCA",
   "titleKana": "グレスカ",
   "titleSize": 44,
   "kanaSize": 22,
   "tagline": "Freestyle ski and snowboard",
   "buttons": {
    "selected": {
     "fill": "indigo",
     "text": "paper"
    },
    "idle": {
     "fill": "paper",
     "text": "key",
     "border": "key"
    },
    "play": {
     "fill": "vermilion",
     "text": "paper",
     "label": "Drop in"
    },
    "radius": 22,
    "height": 44
   },
   "start": "Tap anywhere to start, as now: the tap must not land on a control. The \"Drop in\" pill is a visual cue that also starts the run. Existing tap-to-start tests stay valid.",
   "credit": "Joined from the loaded map's credits list with \" · \". Fallback: the El Tarter line."
  },
  "hud": {
   "score": {
    "font": "display",
    "size": 28,
    "colour": "key",
    "halo": "paper",
    "haloPx": 3
   },
   "speed": {
    "font": "ui",
    "size": 15,
    "colour": "key",
    "halo": "paper",
    "unit": "km/h"
   },
   "popup": {
    "style": "hanko seal",
    "fill": "vermilion",
    "text": "paper",
    "radius": 4,
    "rotateDeg": -4,
    "inMs": 120,
    "holdMs": 800,
    "outMs": 250,
    "size": 24,
    "minTextPx": 18
   },
   "minimap": {
    "card": "paper",
    "cardAlpha": 0.88,
    "route": "key",
    "routeW": 2,
    "rider": "vermilion",
    "features": "mapFeature",
    "radius": 10,
    "padding": 8,
    "sizes": {
     "tall": [
      96,
      140
     ],
     "square": [
      120,
      120
     ]
    },
    "fit": "Run-up: rotate so the start→finish vector points down the card. Fit the rotated polyline's bounding box into the card with 8 px padding and one scale for both axes. Use the tall card when the rotated box is taller than wide, otherwise the square card. A run that turns back on itself still fits, because the whole box is fitted. Draw the route, feature dots and the rider dot. North is not shown."
   }
  },
  "layouts": {
   "portrait": {
    "w": 390,
    "h": 844,
    "score": "top-left",
    "speed": "top-right",
    "minimap": "bottom-right",
    "panelW": "w − 48"
   },
   "small": {
    "w": 360,
    "h": 640,
    "scoreSize": 24,
    "minimap": "square card scaled to 84 px",
    "panelW": "w − 32",
    "titleSize": 36
   },
   "landscape": {
    "w": 844,
    "h": 390,
    "score": "top-left",
    "speed": "beside the score",
    "minimap": "bottom-right, square 96 px",
    "panel": "centred, 360 px wide"
   },
   "safeArea": "Offset every HUD item by env(safe-area-inset-*): top = max(16 px, inset-top + 8 px), and the same for the other sides."
  },
  "ids": {
   "start": "#msg",
   "picker": [
    "#pb",
    "#ps"
   ],
   "score": "#score",
   "popup": "#pop"
  }
 }
};

/* Look up a palette role, or pass a hex value straight through. */
HANGA.colour = function (role) { return HANGA.palette[role] || role; };

/* Turn a hex colour into [r, g, b]. Useful for the FOG and col maps. */
HANGA.rgb = function (role) {
  var h = HANGA.colour(role);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};

/* Posterised tone for a surface. delta = dot(normal, sun) - dot(referenceNormal, sun), where the
   reference is the run's mean slope plane (terrain.posterise). Returns a palette role. */
HANGA.tone = function (surface, delta) {
  var s = HANGA.terrain.surfaces[surface], st = HANGA.terrain.posterise.steps;
  return delta >= st[0][1] ? s.lit : delta >= st[1][1] ? s.mid : s.shade;
};

/* Total shade delta for one pixel: the sun term plus the steepness term (terrain.gradient.slopeTone).
   sunDelta = dot(n, sun) - dot(nRef, sun); slopeDeg = local slope angle; mapId picks maps[id].meanSlopeDeg. */
HANGA.toneDelta = function (sunDelta, slopeDeg, mapId) {
  var g = HANGA.terrain.gradient.slopeTone, ref = HANGA.maps[mapId].meanSlopeDeg;
  var s = g.perDeg * (slopeDeg - ref);
  return sunDelta + Math.max(g.clamp[0], Math.min(g.clamp[1], s));
};

/* Extra fog for ground lying below the rider (terrain.gradient.valleyMist). belowM = riderZ - groundZ. */
HANGA.mistAmount = function (belowM) {
  var m = HANGA.terrain.gradient.valleyMist;
  var t = (belowM - m.startBelowM) / (m.fullBelowM - m.startBelowM);
  return m.add * (t < 0 ? 0 : t > 1 ? 1 : t);
};

/* True where the drop-edge keyline goes: this pixel's distance d and the distance of the pixel above it, dUp (metres). */
HANGA.isDropEdge = function (d, dUp) {
  var e = HANGA.terrain.gradient.dropEdge;
  return isFinite(d) && isFinite(dUp) && dUp - d > Math.max(e.minJumpM, d * e.jumpFrac);
};

/* Camera pitch with partial slope follow (camera.slopeFollow), all angles in degrees, negative = looking down.
   levelPitch: aiming at the point lookAheadM ahead as if the ground were level. fullPitch: aiming at the real ground there.
   riderPitch: direction to the rider. halfVFov: half the vertical field of view. */
HANGA.cameraPitch = function (levelPitch, fullPitch, riderPitch, halfVFov) {
  var f = HANGA.camera.slopeFollow;
  var p = levelPitch + f.tilt * (fullPitch - levelPitch);
  return Math.min(p, riderPitch + halfVFov - f.riderMarginDeg);
};

/* Sun direction for a map, in world axes (x east, y north, z up). */
HANGA.sunVector = function (mapId) { return HANGA.maps[mapId].sun.vector.slice(); };

/* WCAG contrast ratio between two palette roles or hex colours. */
HANGA.contrast = function (a, b) {
  function lum(role) {
    return HANGA.rgb(role).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (acc, v, i) { return acc + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  var x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
};

/* Seconds to blend into a pose (rider.timing). */
HANGA.blendTime = function (toPose) {
  var t = HANGA.rider.timing;
  return toPose in t.into ? t.into[toPose] : t.defaultBlend;
};

/* Fog blend factor 0..1 for distance d (metres) given the renderer's far distance. */
HANGA.fogAmount = function (d, far) {
  var f = HANGA.terrain.fog, t = (d - f.start) / Math.max(1e-6, far - f.start);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.pow(t, f.power);
};

function poseJoints(rig, pose, stance) {
  var base = HANGA.rider.joints[rig], mv = HANGA.rider.poses[rig][pose].move, J = {}, k;
  for (k in base) J[k] = [base[k][0], base[k][1], base[k][2]];
  for (k in mv) { J[k][0] += mv[k][0]; J[k][1] += mv[k][1]; J[k][2] += mv[k][2]; }
  if (rig === 'board' && stance === 'goofy') for (k in J) J[k][2] = -J[k][2];
  return J;
}
HANGA.poseJoints = poseJoints;

/* v1.4 rider rotations (rider.rotations). Angles in degrees; a zero angle leaves points untouched, so v1.3 calls
   give exactly the v1.3 result. */
var D2R = Math.PI / 180;

/* Angle taken modulo 360 into 0..360, so 360 and 0 give the same (exact) result. */
function wrapDeg(deg) {
  const a = deg % 360;
  return a < 0 ? a + 360 : a;
}

/* Turns p about the vertical axis through (px, pz) by deg, clockwise from above (the yaw formula). New array. */
function turnAbout(p, deg, px, pz) {
  const a = deg * D2R;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - px;
  const z = p[2] - pz;
  return [px + x * c + z * s, p[1], pz - x * s + z * c];
}

/* Board flips: rolls p about the board's long axis (z) through (px, py) by deg; + moves points above the pivot toward
   +x (the toe edge and chest). New array. */
function rollAbout(p, deg, px, py) {
  const a = deg * D2R;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - px;
  const y = p[1] - py;
  return [px + x * c + y * s, py - x * s + y * c, p[2]];
}

/* Pitches p about the across axis (x) through (py, pz) by deg; + moves points above the pivot toward +z. New array. */
function pitchAbout(p, deg, py, pz) {
  const a = deg * D2R;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = p[1] - py;
  const z = p[2] - pz;
  return [p[0], py + y * c - z * s, pz + y * s + z * c];
}

/*
 * The rider's own rotations for one projection: returns place(point, group), which moves a posed rider-space point
 * by twist ('lower'), head yaw ('head') and body pitch (every group), or returns it unchanged when all are zero.
 * J: posed joints (goofy already mirrored). twist and headYaw are in the regular frame, so goofy flips their sign.
 */
function riderRotations(J, stance, rig, twistDeg, headYawDeg, bodyPitchDeg) {
  const mirror = rig === 'board' && stance === 'goofy' ? -1 : 1;
  const twist = wrapDeg(twistDeg * mirror);
  const headYaw = wrapDeg(headYawDeg * mirror);
  const pitch = wrapDeg(bodyPitchDeg);
  const neck = J.neck;
  const hip = J.hipC;
  return function place(p, group) {
    let q = p;
    if (group === 'lower' && twist !== 0) q = turnAbout(q, twist, 0, 0);
    if (group === 'head' && headYaw !== 0) q = turnAbout(q, headYaw, neck[0], neck[2]);
    if (pitch !== 0 && rig === 'board') q = rollAbout(q, pitch, hip[0], hip[1]);
    else if (pitch !== 0) q = pitchAbout(q, pitch, hip[1], hip[2]);
    return q;
  };
}

/* Which rotation group each joint of a rig is in: 'lower' (rotations.twist.lower), 'head', or none (upper body). */
function jointGroups(rig) {
  const groups = { head: 'head' };
  HANGA.rider.rotations.twist.lower[rig].forEach(function (j) { groups[j] = 'lower'; });
  return groups;
}

/* v1.4: the equipment items to draw after the body in a flip (rotations.bodyPitch.equipInFront); none otherwise. */
function equipInFront(eq, torsoDepth, bodyPitchDeg) {
  const rule = HANGA.rider.rotations.bodyPitch.equipInFront;
  const pitch = wrapDeg(bodyPitchDeg);
  if (pitch <= rule.fromDeg || pitch >= rule.toDeg) return [];
  return eq.filter(function (it) { return it.depth < torsoDepth - rule.marginM; });
}

/* An option if it is given (a finite number), otherwise the fallback. */
function optionOr(options, key, fallback) {
  const v = options ? options[key] : null;
  return v != null && isFinite(v) ? v : fallback;
}

/*
 * Reference projection (pure maths, no canvas). It is the same code that drew spec sheets 03 and 04.
 * rig: 'ski' | 'board'   pose: one of rider.poseOrder   yaw: board heading minus camera heading (degrees)
 * pitch: camera look-down (default camera.chasePitchDeg)   rollExtra: extra lean, e.g. from turn rate
 * stance: 'regular' (default) or 'goofy' (snowboard only: mirrors z)
 * options (v1.4, optional, degrees; see rider.rotations): {
 *   cameraPitchDeg  the camera's real look-down at the rider this frame; replaces pitch when given
 *   twistDeg        lower body and equipment turned relative to the upper body, + clockwise from above; replaces
 *                   the pose's twistDeg. With a twist, yaw is the upper body's heading
 *   headYawDeg      head (and face vector, so the goggles) turned relative to the shoulders; replaces the pose's
 *   bodyPitchDeg    flip angle about the rider's own left-right axis through hipC (skis: x; board: the board's
 *                   long axis z), + = front flip (chest first); modulo 360
 * }
 * Without options (or with zero angles and cameraPitchDeg = pitch) the result is exactly the v1.3 one.
 * Returns the draw list, back to front. pts are screen metres with +y up and the origin at the feet's ground point.
 * Skis and board come back as {kind:'equip', shapes:[{id, kind:'poly'|'line', pts, colour, keyline?|width?}]}: draw the shapes in order.
 * Multiply by pixels per metre and flip y to draw. Items: {id, kind, pts, width, colour, depth, accent?, goggles?, strap?}
 * kind: 'ellipse' (shadow: c, rx, ry) | 'equip' (shapes) | 'limb' | 'torso' (capsule strokes) | 'circle' | 'head' (radius = width)
 */
HANGA.projectRider = function (rig, pose, yaw, pitch, rollExtra, stance, options) {
  pose = pose || 'ride'; yaw = yaw || 0; rollExtra = rollExtra || 0;
  if (pitch == null) pitch = HANGA.camera.chasePitchDeg;
  var R = HANGA.rider, ps = R.poses[rig][pose], D = Math.PI / 180;
  pitch = optionOr(options, 'cameraPitchDeg', pitch);
  var lam = (ps.roll + rollExtra) * D, phi = yaw * D, th = pitch * D, lift = ps.lift;
  var cl = Math.cos(lam), sl = Math.sin(lam), cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(th), stt = Math.sin(th);
  function T(p, ground) {
    var x = p[0] * cl - p[1] * sl, y = p[0] * sl + p[1] * cl, z = p[2];
    if (!ground) y += lift;
    var x2 = x * cp + z * sp, z2 = -x * sp + z * cp;
    return [x2, y * ct + z2 * stt, z2 * ct - y * stt];
  }
  var J = poseJoints(rig, pose, stance), TJ = {}, k;
  var place = riderRotations(J, stance, rig, optionOr(options, 'twistDeg', ps.twistDeg || 0),
    optionOr(options, 'headYawDeg', ps.headYawDeg || 0), optionOr(options, 'bodyPitchDeg', 0));
  var groupOf = jointGroups(rig);
  for (k in J) TJ[k] = T(place(J[k], groupOf[k]));
  var cw = R.colourways[rig], torsoDep = (TJ.neck[2] + TJ.hipC[2]) / 2, W = R.widths;
  var g = T([0, 0, 0], true), sc = 1 / (1 + lift);
  var out = [{ id: 'shadow', kind: 'ellipse', c: [g[0], g[1]], rx: 0.62 * sc, ry: (0.62 * stt + 0.05) * sc, colour: 'powderShade', depth: 99 }];
  var eq = [], body = [];
  R.parts[rig].forEach(function (part, order) {
    var pts = part.joints.map(function (j) { return TJ[j]; });
    var dep = pts.reduce(function (a, p) { return a + p[2]; }, 0) / pts.length;
    var col = cw[part.colour];
    var far = (part.kind === 'limb' || part.kind === 'circle' || part.kind === 'boot') && dep > torsoDep + 0.04 && part.id !== 'poleL' && part.id !== 'poleR';
    var item = { id: part.id, kind: part.kind, pts: pts.map(function (p) { return [p[0], p[1]]; }), width: W[part.width],
                 colour: far ? (R.shadeOf[col] || col) : col, depth: dep, order: order };
    if (part.kind === 'boot') {
      var a = J[part.joints[0]], toe = T(place([a[0], a[1] - 0.05, a[2] + 0.10], groupOf[part.joints[0]]));
      item.kind = 'limb'; item.pts = [[pts[0][0], pts[0][1] - 0.03], [toe[0], toe[1]]];
    }
    if (part.kind === 'equip') {
      // Skis and board: every shape is a list of (u, v, h) points in equipment space (rider.equipment).
      var A = J[part.joints[0]], B = J[part.joints[1]];
      item.shapes = R.equipment[rig].shapes.map(function (sh) {
        var tp = sh.pts.map(function (q) {
          return T(place([A[0] + q[0] * (B[0] - A[0]) + q[1], A[1] + q[0] * (B[1] - A[1]) + q[2], A[2] + q[0] * (B[2] - A[2])], 'lower'));
        });
        var o = { id: sh.id, kind: sh.kind, pts: tp.map(function (p) { return [p[0], p[1]]; }), colour: cw[sh.colour] || sh.colour };
        if (sh.kind === 'line') o.width = sh.width; else o.keyline = sh.keyline;
        return o;
      });
      delete item.width;
      eq.push(item);
    } else if (part.kind === 'head') {
      var f = R.face[rig].slice(); if (rig === 'board' && stance === 'goofy') f[2] = -f[2];
      var hj = J.head, ft = T(place([hj[0] + f[0], hj[1] + f[1], hj[2] + f[2]], 'head'));
      var fx = ft[0] - pts[0][0], fdep = ft[2] - dep, r = W.head;
      if (fdep < 0.25) {
        var v = Math.max(0, Math.min(1, (0.25 - fdep) / 1.25)), cx = pts[0][0] + fx * r * 0.5, cy = pts[0][1] - 0.015, hl = r * (0.38 + 0.3 * v);
        item.goggles = { frame: { pts: [[cx - hl, cy], [cx + hl, cy]], width: r * 0.62, colour: cw.frame },
                         lens:  { pts: [[cx - hl * 0.8, cy], [cx + hl * 0.8, cy]], width: r * 0.38, colour: cw.lens } };
      } else {
        item.strap = { pts: [[pts[0][0] - r * 0.95, pts[0][1] - 0.02], [pts[0][0] + r * 0.95, pts[0][1] - 0.02]], width: r * 0.3, colour: cw.strap };
      }
      body.push(item);
    } else body.push(item);
  });
  // Far to near; parts at the same depth (within 1e-9 m) keep their order in rider.parts.
  var byDepth = function (a, b) { var d = b.depth - a.depth; return Math.abs(d) < 1e-9 ? a.order - b.order : d; };
  eq.sort(byDepth); body.sort(byDepth);
  var front = equipInFront(eq, torsoDep, optionOr(options, 'bodyPitchDeg', 0));
  return out.concat(eq.filter(function (it) { return front.indexOf(it) < 0; }), body, front);
};

/* v1.4: the brake pose for st.brakeSide, or null when it names none for this rig (then braking stays 'crouch'). */
var BRAKE_POSES = { ski: { left: 'brakeL', right: 'brakeR' }, board: { heel: 'brakeHeel', toe: 'brakeToe' } };
function brakePose(st) {
  const byRig = BRAKE_POSES[st.rig === 'board' ? 'board' : 'ski'];
  return st.brakeSide && byRig.hasOwnProperty(st.brakeSide) ? byRig[st.brakeSide] : null;
}

/* Pick a pose from game state. Thresholds are a starting point to tune on a phone. */
HANGA.poseFor = function (st) {
  // st: {rig, wiped, grinding, airborne, landedAgo, braking, approach, turn, goofy}
  // turn: -1..1 (left..right, in travel direction). landedAgo: seconds since touchdown (undefined if not landing).
  // v1.4, all optional (leaving them out picks exactly the v1.3 pose):
  //   flipping   true while a flip is under way in the air: 'tuck' instead of 'air'
  //   brakeSide  with braking: skis 'left' | 'right' (where the ski tips turn, brakeL | brakeR),
  //              board 'heel' | 'toe' (brakeHeel | brakeToe). Any other value keeps 'crouch'
  //   isSwitch   skis riding backwards: switchL | switchR in place of ride and the carves
  //   lookSide   'left' | 'right' (default), the shoulder a switch skier looks over
  if (st.wiped) return 'wipeout';
  if (st.grinding) return 'grind';
  if (st.airborne) return st.flipping ? 'tuck' : 'air';
  if (st.landedAgo != null && st.landedAgo < HANGA.rider.timing.hold.land) return 'land';
  if (st.braking && brakePose(st)) return brakePose(st);
  if (st.braking || st.approach) return 'crouch';
  if (st.isSwitch && st.rig !== 'board') return st.lookSide === 'left' ? 'switchL' : 'switchR';
  var t = st.turn || 0;
  if (Math.abs(t) <= 0.25) return 'ride';
  if (st.rig === 'board') {
    // Regular stance faces +x (right of travel), so a right turn is on the toe edge. Goofy is the other way round.
    var right = t > 0; if (st.goofy) right = !right;
    return right ? 'carveToe' : 'carveHeel';
  }
  return t < 0 ? 'carveL' : 'carveR';
};

if (typeof module !== 'undefined' && module.exports) module.exports = HANGA;
else root.HANGA = HANGA;
})(this);
