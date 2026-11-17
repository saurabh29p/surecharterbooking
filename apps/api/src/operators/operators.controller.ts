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
  Query,
  UploadedFile,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalDate, optionalText } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AcceptFile, requireFile } from '../files/upload.js';
import {
  AircraftBody,
  BlockBody,
  ContactBody,
  CreateOperatorBody,
  DocumentFields,
  ListQuery,
  UpdateOperatorBody,
  type AircraftInput,
  type ContactInput,
  type CreateOperatorInput,
  type DocumentInput,
  type ListFilters,
  type UpdateOperatorInput,
} from './operator.dto.js';
import { OperatorsService } from './operators.service.js';

const uuid = () => new ParseUUIDPipe();
const DocumentUpdate = z.object({ expiresOn: optionalDate, notes: optionalText(500) });

@Controller()
export class OperatorsController {
  constructor(private readonly ops: OperatorsService) {}

  @Get('operators')
  list(@Query(new ZodPipe(ListQuery)) q: ListFilters) {
    return this.ops.list(q);
  }

  @Post('operators')
  create(
    @Body(new ZodPipe(CreateOperatorBody)) body: CreateOperatorInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ops.create(body, user.id);
  }

  @Get('operators/:id')
  get(@Param('id', uuid()) id: string) {
    return this.ops.get(id);
  }

  @Patch('operators/:id')
  async update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdateOperatorBody)) body: UpdateOperatorInput,
  ) {
    await this.ops.update(id, body);
    return this.ops.get(id);
  }

  @Post('operators/:id/verify')
  @HttpCode(200)
  async verify(@Param('id', uuid()) id: string, @CurrentUser() user: AuthUser) {
    await this.ops.verify(id, user.id);
    return this.ops.get(id);
  }

  @Post('operators/:id/block')
  @HttpCode(200)
  async block(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(BlockBody)) body: { reason: string },
  ) {
    await this.ops.block(id, body.reason);
    return this.ops.get(id);
  }

  @Post('operators/:id/unblock')
  @HttpCode(200)
  async unblock(@Param('id', uuid()) id: string) {
    await this.ops.unblock(id);
    return this.ops.get(id);
  }

  @Get('operators/:id/bank-details')
  async bank(@Param('id', uuid()) id: string) {
    return { bankDetails: await this.ops.revealBankDetails(id) };
  }

  @Post('operators/:id/documents')
  @AcceptFile()
  async addDocument(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(DocumentFields)) body: DocumentInput,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const f = requireFile(file);
    await this.ops.addDocument(id, body, { buffer: f.buffer, originalName: f.originalname });
    return this.ops.get(id);
  }

  @Post('operator-documents/:docId/verify')
  @HttpCode(204)
  verifyDocument(@Param('docId', uuid()) docId: string, @CurrentUser() user: AuthUser) {
    return this.ops.verifyDocument(docId, user.id);
  }

  @Patch('operator-documents/:docId')
  @HttpCode(204)
  updateDocument(
    @Param('docId', uuid()) docId: string,
    @Body(new ZodPipe(DocumentUpdate)) body: z.infer<typeof DocumentUpdate>,
  ) {
    return this.ops.updateDocument(docId, body);
  }

  @Delete('operator-documents/:docId')
  @HttpCode(204)
  deleteDocument(@Param('docId', uuid()) docId: string) {
    return this.ops.deleteDocument(docId);
  }

  @Post('operators/:id/aircraft')
  addAircraft(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(AircraftBody)) body: AircraftInput,
  ) {
    return this.ops.addAircraft(id, body);
  }

  @Patch('aircraft/:aircraftId')
  updateAircraft(
    @Param('aircraftId', uuid()) aircraftId: string,
    @Body(new ZodPipe(AircraftBody.partial())) body: Partial<AircraftInput>,
  ) {
    return this.ops.updateAircraft(aircraftId, body);
  }

  @Delete('aircraft/:aircraftId')
  @HttpCode(204)
  removeAircraft(@Param('aircraftId', uuid()) aircraftId: string) {
    return this.ops.removeAircraft(aircraftId);
  }

  @Post('operators/:id/contacts')
  addContact(@Param('id', uuid()) id: string, @Body(new ZodPipe(ContactBody)) body: ContactInput) {
    return this.ops.addContact(id, body);
  }

  @Patch('operator-contacts/:contactId')
  updateContact(
    @Param('contactId', uuid()) contactId: string,
    @Body(new ZodPipe(ContactBody.partial())) body: Partial<ContactInput>,
  ) {
    return this.ops.updateContact(contactId, body);
  }

  @Delete('operator-contacts/:contactId')
  @HttpCode(204)
  removeContact(@Param('contactId', uuid()) contactId: string) {
    return this.ops.removeContact(contactId);
  }
}
