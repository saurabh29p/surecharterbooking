import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runRequest } from './request-context.js';

/** Gives every request its own audit context (PUBLIC until the login guard identifies the user). */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction) {
    runRequest(() => next());
  }
}
