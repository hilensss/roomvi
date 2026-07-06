import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GuestService } from '../guest/guest.service.js';
import { StorageService } from '../storage/storage.service.js';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { FileOwnerType } from '@roomvi/database';
import { createSafeFileName } from './utils/file-name.util.js';
import { FILE_PURPOSES } from './constants/upload.constants.js';

type UploadRoomImageInput = {
  user?: JwtUser;
  guestAnonymousId?: string;
  file: Express.Multer.File;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestService: GuestService,
    private readonly storageService: StorageService,
  ) {}

  async uploadRoomImage(input: UploadRoomImageInput) {
    if (!input.file) {
      throw new BadRequestException('File is required');
    }

    const owner = await this.resolveOwner(input);

    const fileName = createSafeFileName(input.file.originalname);
    const storageKey = `uploads/rooms/${fileName}`;

    const uploadedFile = await this.storageService.uploadFile({
      buffer: input.file.buffer,
      key: storageKey,
      mimeType: input.file.mimetype,
    });

    const file = await this.prisma.file.create({
      data: {
        ownerType: owner.ownerType,
        userId: owner.userId,
        guestSessionId: owner.guestSessionId,
        originalName: input.file.originalname,
        fileName,
        mimeType: input.file.mimetype,
        sizeBytes: input.file.size,
        storageKey: uploadedFile.key,
        url: uploadedFile.url,
        purpose: FILE_PURPOSES.ROOM_SOURCE_IMAGE,
      },
    });

    return { file };
  }

  private async resolveOwner(input: {
    user?: JwtUser;
    guestAnonymousId?: string;
  }) {
    if (input.user) {
      return {
        ownerType: FileOwnerType.USER,
        userId: input.user.userId,
        guestSessionId: undefined,
      };
    }

    if (!input.guestAnonymousId) {
      throw new UnauthorizedException('Auth or guest session required');
    }

    const guestSession = await this.guestService.findValidSessionByAnonymousId(
      input.guestAnonymousId,
    );
    if (!guestSession) {
      throw new UnauthorizedException('Invalid guest session');
    }

    return {
      ownerType: FileOwnerType.GUEST,
      userId: undefined,
      guestSessionId: guestSession.id,
    };
  }
}
