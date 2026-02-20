import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '../../../generated/prisma/enums.js';

type UserPayload = {
  userId: string;
  email: string;
  role: Role;
};

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: UserPayload }>();
    const { user } = request;

    return data ? user[data] : user;
  },
);
