import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateB2BProjectDto } from './create-b2b-project.dto.js';

export class UpdateB2BProjectDto extends PartialType(
  OmitType(CreateB2BProjectDto, ['type'] as const),
) {}
