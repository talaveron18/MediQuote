import path from 'path';

/** Carpeta persistente de datos. Electron la fija a app.getPath('userData'). */
export function dataRoot(): string {
  return process.env.GASI_DATA_DIR?.trim() || process.cwd();
}

export function dataPath(...segments: string[]): string {
  return path.join(dataRoot(), ...segments);
}
