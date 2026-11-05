/** Imports are parsed in the tab; cap them so a large file cannot freeze it. */
export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

export async function readJsonFile(file: File): Promise<unknown> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `文件 ${file.name} 为 ${sizeMb} MB，超过 ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB 导入上限。`,
    );
  }
  return JSON.parse(await file.text()) as unknown;
}
