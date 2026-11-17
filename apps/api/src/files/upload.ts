import { BadRequestException, UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

/** Hard ceiling for any single upload; each purpose has its own, smaller limit in FilesService. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Accept one multipart file in the field "file". */
export const AcceptFile = () =>
  applyDecorators(
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } })),
  );

export function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw new BadRequestException('Choose a file to upload');
  return file;
}
