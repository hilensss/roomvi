import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FilesService } from './files.service.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ALLOWED_ROOM_IMAGE_MIME_TYPES,
  ROOM_IMAGE_MAX_SIZE_BYTES,
  ROOM_IMAGE_UPLOAD_FIELD,
} from './constants/upload.constants.js';
import { memoryStorage } from 'multer';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { GUEST_COOKIE_NAMES } from '../guest/constants/guest-cookies.constants.js';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor(ROOM_IMAGE_UPLOAD_FIELD, {
      storage: memoryStorage(),
      limits: { fileSize: ROOM_IMAGE_MAX_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_ROOM_IMAGE_MIME_TYPES.includes(file.mimetype as never)) {
          return callback(
            new BadRequestException(
              'Only JPEG, PNG and WEBP images are allowed',
            ) as never,
            false,
          );
        }

        return callback(null, true);
      },
    }),
  )
  async uploadRoomImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('File is required');

    return this.filesService.uploadRoomImage({
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
      file,
    });
  }
}
