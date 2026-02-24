import { SetMetadata } from '@nestjs/common';

export const ResponseMessage = (message: string) => {
  return SetMetadata('response_message', message);
};
