// M14b (UXS-21): the replica labs and the pose editor, in their own chunk. BootScene loads this
// only behind `?lab`, so the game's main bundle carries none of them.
import '../labs/aiLabs';
import '../labs/bossLabs';
import '../labs/comboLabs';
import '../labs/coopLabs';
import '../labs/enemyLabs';
import '../labs/gunLabs';
import '../labs/hazardLabs';
import '../labs/meleeLabs';
import '../labs/movementLabs';
import '../labs/qolLabs';
import '../labs/rageLabs';
import '../labs/stage2Labs';
import '../labs/stage3Labs';
import '../labs/stage4Labs';
import '../labs/throwLabs';
import '../labs/toolLabs';

export { LabIndexScene } from './LabIndexScene';
export { PoseEditorScene } from './PoseEditorScene';
