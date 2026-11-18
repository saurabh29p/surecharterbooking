import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ConsentSource, ConsentSubject } from '@shubhjets/shared';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  ClientFields,
  ConsentBody,
  UpdateClientBody,
  type ClientInput,
  type ConsentInput,
  type UpdateClientInput,
} from './client.dto.js';
import { ClientsService } from './clients.service.js';
import { ConsentService } from './consent.service.js';

const uuid = () => new ParseUUIDPipe();
const ClientQuery = z.object({
  q: z.string().trim().max(80).optional(),
  partnerId: z.string().uuid().optional(),
});
const ConsentQuery = z.object({
  subjectType: z.enum(['PARTNER', 'CLIENT', 'ENQUIRY', 'GUEST']),
  subjectId: z.string().uuid(),
});

@Controller()
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly consents: ConsentService,
  ) {}

  @Get('clients')
  list(@Query(new ZodPipe(ClientQuery)) q: z.infer<typeof ClientQuery>) {
    return this.clients.list(q);
  }

  @Post('clients')
  create(@Body(new ZodPipe(ClientFields)) body: ClientInput, @CurrentUser() user: AuthUser) {
    return this.clients.create(body, user.id);
  }

  @Get('clients/:id')
  get(@Param('id', uuid()) id: string) {
    return this.clients.get(id);
  }

  @Patch('clients/:id')
  async update(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(UpdateClientBody)) body: UpdateClientInput,
  ) {
    await this.clients.update(id, body);
    return this.clients.get(id);
  }

  @Get('consents')
  listConsents(@Query(new ZodPipe(ConsentQuery)) q: z.infer<typeof ConsentQuery>) {
    return this.consents.list(q.subjectType as ConsentSubject, q.subjectId);
  }

  @Post('consents')
  record(@Body(new ZodPipe(ConsentBody)) body: ConsentInput) {
    return this.consents.record({
      subjectType: body.subjectType as ConsentSubject,
      subjectId: body.subjectId,
      source: body.source as ConsentSource,
      givenAt: body.givenAt,
    });
  }

  @Post('consents/:id/withdraw')
  @HttpCode(200)
  withdraw(@Param('id', uuid()) id: string) {
    return this.consents.withdraw(id);
  }
}
