import { Controller, Get, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { FilesService } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** A short-lived link to open or download a file the user can see. */
  @Post(':id/link')
  link(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.files.link(id, 'opened in desk');
  }

  /** Serves a file from a signed link (no login: the link itself is the permission, for 5 minutes). */
  @Public()
  @Get('download/:token')
  async download(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const { file, bytes } = await this.files.read(this.files.verify(token));
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `inline; filename="${(file.originalName ?? 'file').replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    return new StreamableFile(bytes);
  }
}
