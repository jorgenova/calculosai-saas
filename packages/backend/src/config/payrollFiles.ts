import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { PayrollError } from '../middlewares/payroll';

const storageKeyPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const maxPayrollFileBytes = 10 * 1024 * 1024;

function storagePath(storageKey: string) {
  if (!storageKeyPattern.test(storageKey)) throw new PayrollError(404, 'Payroll document was not found');
  const directory = process.env.PAYROLL_STORAGE_DIRECTORY;
  if (!directory || !path.isAbsolute(directory)) throw new PayrollError(503, 'Payroll document storage is unavailable');
  return path.join(directory, storageKey);
}

export async function readPayrollFile(storageKey: string) {
  try {
    const file = await open(storagePath(storageKey), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > maxPayrollFileBytes) throw new PayrollError(404, 'Payroll document was not found');
      return await file.readFile();
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') throw new PayrollError(404, 'Payroll document was not found');
    throw error;
  }
}
