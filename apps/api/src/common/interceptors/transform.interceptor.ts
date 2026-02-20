import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        const message =
          this.reflector.get<string>(
            'response_message',
            context.getHandler(),
          ) ?? 'Success';

        return {
          data: data,
          message,
          success: true,
          statusCode: context.switchToHttp().getResponse().statusCode,
        };
      }),
    );
  }
}
