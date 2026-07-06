import { IsEnum, IsOptional } from 'class-validator';
import { GenerationJobStatus } from '@roomvi/database';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto.js';

export class AdminGenerationsQueryDto extends AdminPaginationQueryDto {
  @IsOptional()
  @IsEnum(GenerationJobStatus)
  status?: GenerationJobStatus;
}
