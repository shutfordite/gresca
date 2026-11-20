// Map size, the finish line, and where the kickers and rails go (the course definitions everything else reads).
const W0=1000,H0=2450,FIN=2330;
// Terrain park. Kickers launch fast riders; KBIG ones have taller ramps and give more air.
const KICK=[260,340,400,760,840,920,1060,1250,1400,1560,1680,1850,1990,2150];
const KBIG=new Set([400,920,1250,1680,2150]);
// Rails and boxes: [start y, length, offset from the piste centreline, type]. They sit between the kickers.
const RAIL_DEF=[[285,20,-9,'rail'],[355,18,9,'box'],[775,22,-9,'rail'],[855,18,9,'box'],[940,24,-9,'rail'],[1080,16,9,'box'],[1125,22,-9,'rail'],[1275,20,9,'rail'],[1420,24,-9,'box'],[1590,20,9,'rail'],[1700,22,-9,'rail'],[1880,18,9,'box'],[2020,24,-9,'rail']];
