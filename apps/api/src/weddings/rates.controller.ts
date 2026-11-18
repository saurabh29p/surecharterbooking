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
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../auth/public.decorator.js';
import { optionalSchedule, optionalText } from '../common/fields.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { RatesService } from './rates.service.js';

const uuid = () => new ParseUUIDPipe();

const RequestBody = z.object({
  operatorIds: z.array(z.string().uuid()).min(1, 'Choose at least one operator').max(10),
  legIds: z.array(z.string().uuid()).optional(),
  channel: z.enum(['WHATSAPP', 'EMAIL', 'PHONE', 'OTHER']).default('WHATSAPP'),
});

const optionalDateTime = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : new Date(v)))
  .refine((v) => v === undefined || v === null || !Number.isNaN(v.getTime()), {
    message: 'Choose a date and time',
  });

const ResponseFields = z.object({
  operatorId: z.string().uuid({ message: 'Choose an operator' }),
  rateRequestId: z.string().uuid().nullable().optional(),
  aircraftId: z.string().uuid().nullable().optional(),
  aircraftText: optionalText(120),
  seats: z.number().int().min(1, 'At least 1 seat').max(400).nullable().optional(),
  /** Paise, ex-GST, for everything the reply covers. */
  netRate: z
    .number({ message: 'Enter the net rate in rupees' })
    .int()
    .positive('Enter the net rate in rupees'),
  legIds: z.array(z.string().uuid()).min(1, 'Choose which leg(s) this rate covers'),
  costShares: z.array(z.number().int().min(0)).nullable().optional(),
  inclusions: optionalText(2000),
  exclusions: optionalText(2000),
  cancellationTerms: optionalText(2000),
  cancellationSchedule: optionalSchedule,
  validUntil: optionalDateTime,
  receivedAt: optionalDateTime,
  rawText: optionalText(10_000),
});
type ResponseBody = z.infer<typeof ResponseFields>;
const UpdateResponseFields = ResponseFields.omit({ operatorId: true }).partial();
const ChoiceBody = z.object({ rateResponseIds: z.array(z.string().uuid()).max(6) });

@Controller()
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get('weddings/:id/rates')
  overview(@Param('id', uuid()) id: string) {
    return this.rates.overview(id);
  }

  @Get('legs/:legId/suggestions')
  suggestions(@Param('legId', uuid()) legId: string) {
    return this.rates.suggestions(legId);
  }

  @Post('weddings/:id/rate-requests')
  request(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(RequestBody)) body: z.infer<typeof RequestBody>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rates.request(id, body, user.id);
  }

  @Get('rate-requests/:requestId/message')
  message(@Param('requestId', uuid()) requestId: string) {
    return this.rates.requestMessage(requestId);
  }

  @Post('weddings/:id/rate-responses')
  addResponse(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(ResponseFields)) body: ResponseBody,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rates.addResponse(id, body, user.id);
  }

  @Patch('rate-responses/:responseId')
  @HttpCode(204)
  updateResponse(
    @Param('responseId', uuid()) responseId: string,
    @Body(new ZodPipe(UpdateResponseFields)) body: z.infer<typeof UpdateResponseFields>,
  ) {
    return this.rates.updateResponse(responseId, body);
  }

  @Delete('rate-responses/:responseId')
  @HttpCode(204)
  deleteResponse(@Param('responseId', uuid()) responseId: string) {
    return this.rates.deleteResponse(responseId);
  }

  /** Replace the chosen jet(s) for a leg; an empty list clears the choice. */
  @Put('legs/:legId/choices')
  @HttpCode(204)
  choose(
    @Param('legId', uuid()) legId: string,
    @Body(new ZodPipe(ChoiceBody)) body: z.infer<typeof ChoiceBody>,
  ) {
    return this.rates.choose(legId, body.rateResponseIds);
  }
}
