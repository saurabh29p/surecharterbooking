import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
} from '@nestjs/common';
import { parseGuestLines } from '@shubhjets/shared';
import { z } from 'zod';
import { optionalPhone } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import { GuestsService } from './guests.service.js';

const uuid = () => new ParseUUIDPipe();

const AddBody = z
  .object({
    /** Names one per line (as pasted from WhatsApp), optionally with a phone after a comma. */
    text: z.string().max(40_000).optional(),
    guests: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          phone: z.string().max(20).nullable().optional(),
        }),
      )
      .max(400)
      .optional(),
  })
  .refine((b) => !!b.text?.trim() || !!b.guests?.length, {
    message: 'Add at least one name',
    path: ['text'],
  });

const UpdateBody = z.object({
  name: z.string().trim().min(1, 'Enter the name').max(120).optional(),
  phone: optionalPhone,
  idReceived: z.boolean().optional(),
});

@Controller()
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get('weddings/:id/guests')
  manifest(@Param('id', uuid()) id: string) {
    return this.guests.manifest(id);
  }

  @Post('legs/:id/guests')
  add(@Param('id', uuid()) id: string, @Body(new ZodPipe(AddBody)) body: z.infer<typeof AddBody>) {
    const list = body.guests ?? parseGuestLines(body.text ?? '');
    return this.guests.add(id, list);
  }

  @Post('legs/:id/guests/copy-from/:from')
  copy(@Param('id', uuid()) id: string, @Param('from', uuid()) from: string) {
    return this.guests.copy(id, from);
  }

  @Patch('guests/:id')
  @HttpCode(204)
  async update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdateBody)) body: z.infer<typeof UpdateBody>,
  ) {
    await this.guests.update(id, body);
  }

  @Delete('guests/:id')
  @HttpCode(204)
  async remove(@Param('id', uuid()) id: string) {
    await this.guests.remove(id);
  }

  /** Photo or PDF of the guest's ID; encrypted by the app before storage. */
  @Post('guests/:id/id-document')
  @HttpCode(204)
  @AcceptFile()
  async uploadId(
    @Param('id', uuid()) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const f = requireFile(file);
    await this.guests.uploadId(id, { buffer: f.buffer, originalName: f.originalname });
  }

  @Post('guests/:id/id-document/link')
  idLink(@Param('id', uuid()) id: string) {
    return this.guests.idLink(id);
  }

  @Delete('guests/:id/id-document')
  @HttpCode(204)
  async deleteId(@Param('id', uuid()) id: string) {
    await this.guests.deleteId(id);
  }
}
